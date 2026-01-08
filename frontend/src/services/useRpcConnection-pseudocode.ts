// It no longer needs to manage "handshakeState" loops.
// It simply pings the transport to see if it's alive.
const checkConnection = useCallback(async () => {
    try {
        await client.fetchSessionStats(); // This triggers the transport's auto-connect
        setStatus(STATUS.connection.CONNECTED);
    } catch (e) {
        setStatus(STATUS.connection.ERROR);
    }
}, [client]);
