const select = document.querySelector('#qa-check');
const status = document.querySelector('#qa-status');
const detail = document.querySelector('#qa-detail');

try {
    const response = await fetch('/api/qa/results');
    if (!response.ok) throw new Error('QA results could not be loaded.');
    const { checks, generatedAt } = await response.json();
    if (checks.length === 0) {
        status.textContent = 'No execution records found. Run the QA harness and generate the report.';
    } else {
        const byId = new Map(checks.map(check => [check.featureId, check]));
        for (const { featureId, project } of checks) {
            select.add(new Option(`${project} · ${featureId}`, featureId));
        }
        select.disabled = false;
        const showCheck = () => {
            const { label, runtimeMode, counts, status } = byId.get(select.value);
            const fields = [
                ['Expected', label], ['Runtime mode', runtimeMode], ['Latest result', status],
                ['Recorded attempts', `${counts.PASS} passed, ${counts.FAIL} failed, ${counts.BLOCKED} blocked, ${counts.SKIPPED} skipped`],
            ];
            detail.replaceChildren(...fields.flatMap(([name, value]) => {
                const term = document.createElement('dt');
                const description = document.createElement('dd');
                term.textContent = name;
                description.textContent = value;
                return [term, description];
            }));
        };
        select.addEventListener('change', showCheck);
        const initial = checks.find(check => check.counts.FAIL || check.counts.BLOCKED);
        if (initial) select.value = initial.featureId;
        showCheck();
        status.textContent = `${checks.length} recorded checks · Updated ${new Date(generatedAt).toLocaleString()}`;
    }
} catch {
    status.textContent = 'QA results are unavailable. Regenerate the report and refresh.';
}
