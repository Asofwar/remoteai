package com.codexswitch.downloads

import java.net.Socket

/** Socket ownership and progress are scoped to a registered encrypted receiver. */
internal class PortStreamSinks(private val wake: () -> Unit) {
  companion object {
    private const val MAX_SINKS = 24
    private val claimed = mutableSetOf<Socket>()
  }
  data class Progress(val requestId: String, val value: PortStreamSink.Progress)
  private data class Binding(val socket: Socket, val sink: PortStreamSink)
  private val bindings = mutableMapOf<String, Binding>()
  private val updates = mutableMapOf<String, PortStreamSink.Progress>()
  private var closed = false

  @Synchronized fun bind(id: String, socket: Socket) {
    check(!closed && !bindings.containsKey(id))
    synchronized(claimed) { check(claimed.size < MAX_SINKS && claimed.add(socket)) }
    bindings[id] = Binding(socket, PortStreamSink(socket, report = { progress -> update(id, progress) }))
  }

  private fun update(id: String, progress: PortStreamSink.Progress) {
    synchronized(this) {
      if (closed || !bindings.containsKey(id)) return
      val previous = updates[id]
      // A concurrent timeout/close must never be overwritten by a late successful write report.
      if (previous?.failed == true || previous != null && previous.consumed > progress.consumed) return
      updates[id] = progress
    }
    wake()
  }

  fun receive(frame: PortStreamCipher.Frame): Boolean {
    val sink = synchronized(this) { bindings[frame.id]?.sink } ?: return false
    val type = frame.bytes[0].toInt()
    if (type != PortStreamBuffer.DATA && type != PortStreamBuffer.END) return false
    sink.receive(frame.bytes)
    return true
  }

  @Synchronized fun drain(): List<Progress> = updates.map { Progress(it.key, it.value) }.also { updates.clear() }

  fun unbind(id: String) {
    val binding = synchronized(this) { updates.remove(id); bindings.remove(id) } ?: return
    binding.sink.close()
    synchronized(claimed) { claimed.remove(binding.socket) }
  }

  fun close() {
    val ids = synchronized(this) { closed = true; bindings.keys.toList() }
    ids.forEach { unbind(it) }
  }
}
