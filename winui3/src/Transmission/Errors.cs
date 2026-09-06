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

public abstract class RpcException : Exception
{
    private protected RpcException(string message, Exception? inner)
        : base(message, inner)
    {
    }
}

/// <summary>The daemon could not be reached, answered something we cannot read, or took too long.</summary>
public sealed class RpcTransportException : RpcException
{
    public RpcTransportException(string message, Exception? inner = null)
        : base(message, inner)
    {
    }
}

/// <summary>The daemon refused the caller: 401 for bad credentials, 403 for a refused client.</summary>
public sealed class RpcAuthenticationException : RpcException
{
    public RpcAuthenticationException(string message)
        : base(message, null)
    {
    }
}

/// <summary>One method failed. The daemon answered 200 and a JSON-RPC error object.</summary>
public sealed class RpcMethodException : RpcException
{
    public RpcMethodException(string method, RpcError code, string message)
        : base(message, null)
    {
        Method = method;
        Code = code;
    }

    public string Method { get; }

    public RpcError Code { get; }

    /// <summary>True for a JSON-RPC framing error, false for one of Transmission's own.</summary>
    public bool IsProtocol => (int)Code < 0;
}
