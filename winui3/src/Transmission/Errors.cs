namespace Transmission;

/// <summary>Transcribed from <c>JsonRpc::Error::Code</c> in <c>libtransmission/rpcimpl.h:29-46</c>.</summary>
public enum RpcError
{
    ParseError = -32700,
    InvalidRequest = -32600,
    MethodNotFound = -32601,
    InvalidParams = -32602,
    InternalError = -32603,
    Success = 0,
    SetAnnounceList = 1,
    InvalidTrackerList = 2,
    PathNotAbsolute = 3,
    UnrecognizedInfo = 4,
    SystemError = 5,
    FileIndexOutOfRange = 6,
    PieceIndexOutOfRange = 7,
    HttpError = 8,
    CorruptTorrent = 9,
}

/// <summary>
/// What kind of failure this was. Four, because each one asks the caller for something different:
/// wait, fix the credentials, fix the daemon's configuration, or use a newer daemon.
/// </summary>
public enum RpcFault
{
    /// <summary>Nothing answered, or not in time. Trying again later is the whole remedy.</summary>
    Unreachable,

    /// <summary>The user name or password was rejected.</summary>
    Unauthorized,

    /// <summary>The daemon refused this client outright: not whitelisted, or locked out.</summary>
    Refused,

    /// <summary>The daemon answered, and what it said is not something this client can use.</summary>
    Protocol,
}

public abstract class RpcException : Exception
{
    private protected RpcException(RpcFault fault, string message, Exception? inner)
        : base(message, inner)
    {
        Fault = fault;
    }

    public RpcFault Fault { get; }
}

/// <summary>The daemon could not be reached, answered something we cannot read, or took too long.</summary>
public sealed class RpcTransportException : RpcException
{
    public RpcTransportException(RpcFault fault, string message, Exception? inner = null)
        : base(fault, message, inner)
    {
    }
}

/// <summary>The daemon refused the caller: 401 for bad credentials, 403 for a refused client.</summary>
public sealed class RpcAuthenticationException : RpcException
{
    public RpcAuthenticationException(RpcFault fault, string message)
        : base(fault, message, null)
    {
    }
}

/// <summary>One method failed. The daemon answered 200 and a JSON-RPC error object.</summary>
public sealed class RpcMethodException : RpcException
{
    public RpcMethodException(string method, RpcError code, string message)
        : base(RpcFault.Protocol, message, null)
    {
        Method = method;
        Code = code;
    }

    public string Method { get; }

    public RpcError Code { get; }

    /// <summary>True for a JSON-RPC framing error, false for one of Transmission's own.</summary>
    public bool IsProtocol => (int)Code < 0;
}
