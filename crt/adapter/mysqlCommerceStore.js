import { AsyncLocalStorage } from 'node:async_hooks';
import mysql from 'mysql2/promise';

export async function openCommerceStore(url, namespace = 'commerce-v1') {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(namespace)) throw new Error('Invalid commerce storage namespace.');
    const pool = mysql.createPool(url);
    const transaction = new AsyncLocalStorage();
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS crt_tenant_transactions (
            scope VARBINARY(64) NOT NULL, tenant_id VARBINARY(128) NOT NULL,
            PRIMARY KEY (scope, tenant_id)
        ) ENGINE=InnoDB`);
        await pool.query(`CREATE TABLE IF NOT EXISTS crt_documents (
            scope VARBINARY(64) NOT NULL, document_key VARBINARY(1024) NOT NULL, body MEDIUMTEXT NOT NULL,
            PRIMARY KEY (scope, document_key)
        ) ENGINE=InnoDB`);
    } catch (error) {
        await pool.end();
        throw error;
    }
    const writer = () => {
        const connection = transaction.getStore();
        if (!connection) throw new Error('Commerce writes require an active tenant transaction.');
        return connection;
    };
    return {
        async transact(tenantId, operation) {
            if (transaction.getStore()) throw new Error('Nested commerce transaction.');
            const connection = await pool.getConnection();
            try {
                await connection.beginTransaction();
                // The unique row serializes mutations within this tenant across all API processes.
                await connection.execute(`INSERT INTO crt_tenant_transactions (scope, tenant_id) VALUES (?, ?)
                    ON DUPLICATE KEY UPDATE tenant_id = tenant_id`, [namespace, tenantId]);
                await connection.execute('SELECT tenant_id FROM crt_tenant_transactions WHERE scope = ? AND tenant_id = ? FOR UPDATE',
                    [namespace, tenantId]);
                const result = await transaction.run(connection, operation);
                await connection.commit();
                return result;
            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }
        },
        async get(key) {
            const [rows] = await (transaction.getStore() ?? pool).execute(
                'SELECT body FROM crt_documents WHERE scope = ? AND document_key = ?', [namespace, key]);
            return rows.length ? { found: true, value: rows[0].body } : { found: false };
        },
        async put(key, value) {
            await writer().execute(`INSERT INTO crt_documents (scope, document_key, body) VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE body = ?`, [namespace, key, value, value]);
        },
        async delete(key) {
            await writer().execute('DELETE FROM crt_documents WHERE scope = ? AND document_key = ?', [namespace, key]);
        },
        close: () => pool.end(),
    };
}
