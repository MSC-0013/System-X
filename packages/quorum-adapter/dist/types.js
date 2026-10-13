export class QuorumControlApiError extends Error {
    statusCode;
    endpoint;
    errorPayload;
    constructor(message, statusCode, endpoint, errorPayload) {
        super(message);
        this.name = 'QuorumControlApiError';
        this.statusCode = statusCode;
        this.endpoint = endpoint;
        this.errorPayload = errorPayload;
    }
}
export class QuorumNodeError extends Error {
    nodeEndpoint;
    grpcCode;
    constructor(message, nodeEndpoint, grpcCode) {
        super(message);
        this.name = 'QuorumNodeError';
        this.nodeEndpoint = nodeEndpoint;
        this.grpcCode = grpcCode;
    }
}
//# sourceMappingURL=types.js.map