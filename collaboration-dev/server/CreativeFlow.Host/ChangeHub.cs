using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Primitives;

namespace CreativeFlow.Host;

public sealed class ChangeHub
{
    private readonly ConcurrentDictionary<Guid,(string Workspace,WebSocket Socket,SemaphoreSlim Gate)> clients = new();
    public async Task SignalAsync(string workspace)
    {
        foreach (var client in clients.Values.Where(value => value.Workspace == workspace)) {
            if (!await client.Gate.WaitAsync(0)) continue;
            try { if (client.Socket.State == WebSocketState.Open) await client.Socket.SendAsync(Encoding.UTF8.GetBytes("changed"), WebSocketMessageType.Text, true, CancellationToken.None); }
            catch (Exception error) when (error is WebSocketException or ObjectDisposedException) { }
            finally { client.Gate.Release(); }
        }
    }
    public async Task ConnectAsync(HttpContext context, string workspace, WorkspaceService service)
    {
        if (!context.WebSockets.IsWebSocketRequest) { context.Response.StatusCode=400; return; }
        using var socket = await context.WebSockets.AcceptWebSocketAsync();
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted); timeout.CancelAfter(TimeSpan.FromSeconds(10));
        var buffer = new byte[4096];
        try {
            var first = await socket.ReceiveAsync(buffer, timeout.Token);
            if (!first.EndOfMessage || first.MessageType != WebSocketMessageType.Text) return;
            var token = JsonSerializer.Deserialize<string>(Encoding.UTF8.GetString(buffer,0,first.Count));
            var identity = await service.AuthenticateAsync(new StringValues("Bearer " + token));
            if (identity?.WorkspaceId != workspace) return;
            var id = Guid.NewGuid(); var gate = new SemaphoreSlim(1);
            clients[id] = (workspace,socket,gate);
            try {
                await gate.WaitAsync(context.RequestAborted);
                try { await socket.SendAsync(Encoding.UTF8.GetBytes("ready"), WebSocketMessageType.Text, true, context.RequestAborted); }
                finally { gate.Release(); }
                while (!context.RequestAborted.IsCancellationRequested && socket.State == WebSocketState.Open) {
                    var result = await socket.ReceiveAsync(buffer, context.RequestAborted);
                    if (result.MessageType == WebSocketMessageType.Close) break;
                    if (await service.AuthenticateAsync(new StringValues("Bearer " + token)) is null) break;
                }
            } finally { clients.TryRemove(id,out _); }
        } catch (Exception error) when (error is WebSocketException or OperationCanceledException or JsonException) { }
    }
}
