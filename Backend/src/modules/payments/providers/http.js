/** Small JSON-over-HTTP helper with a hard timeout, used by the provider adapters that talk REST directly. */
export class ProviderHttpError extends Error {
    constructor(message, { status = 0, body = null } = {}) {
        super(message);
        this.name = 'ProviderHttpError';
        this.status = status;
        this.body = body;
    }
}

export const requestJson = async (url, { method = 'GET', headers = {}, body, timeoutMs = 20000 } = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
        res = await fetch(url, {
            method,
            headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: controller.signal
        });
    } catch (err) {
        throw new ProviderHttpError(err?.name === 'AbortError' ? 'Payment provider timed out' : `Payment provider unreachable: ${err.message}`);
    } finally {
        clearTimeout(timer);
    }
    const text = await res.text();
    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        /* non-JSON body */
    }
    if (!res.ok) {
        const detail = json?.error || json?.message || text.slice(0, 200) || res.statusText;
        throw new ProviderHttpError(`Payment provider error (${res.status}): ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`, { status: res.status, body: json });
    }
    return json;
};
