
export const toOpen = (ws: WebSocket): Promise<void> =>
    new Promise<void>((resolve) => {
        if (ws.readyState == WebSocket.OPEN) {
            resolve();
        } else {
            ws.addEventListener('open', () => {
                resolve();
            });
        }
    });
