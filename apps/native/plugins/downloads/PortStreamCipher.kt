package com.codexswitch.downloads

import com.codexswitch.crypto.PacketCipher
import java.nio.ByteBuffer
import java.util.UUID

/** Receive-only stream key; reordered direct/relay records share one bounded replay window. */
internal class PortStreamCipher(key: String, private val transfer: UUID, private val epoch: UUID) {
  companion object {
    private const val HEADER_BYTES = 72
    private const val TAG_BYTES = 16
    private const val MAX_RECORD_BYTES = 16384
    private const val BLOCK_BYTES = 1024 * 1024
    private const val REPLAY_WINDOW = 4096
  }
  data class Frame(val id: String, val bytes: ByteArray)
  private val cipher = PacketCipher(PacketCipher.fromHex(key), byteArrayOf())
  private val sequences = LongArray(REPLAY_WINDOW)
  private var highest = 0L
  private var closed = false

  @Synchronized fun decrypt(record: ByteArray): Frame? {
    check(!closed)
    require(record.size in HEADER_BYTES + TAG_BYTES + 1..MAX_RECORD_BYTES)
    val buffer = ByteBuffer.wrap(record)
    require(buffer.int == 0x52414231 && buffer.get().toInt() == 1 && buffer.get().toInt() == 1)
    require(buffer.short.toInt() == HEADER_BYTES)
    require(UUID(buffer.long, buffer.long) == transfer && UUID(buffer.long, buffer.long) == epoch)
    val id = UUID(buffer.long, buffer.long).toString()
    buffer.int // Block is an unsigned protocol field, unused by byte streams.
    val offset = buffer.int.toLong() and 0xffffffffL
    val length = buffer.int
    val sequence = buffer.int.toLong() and 0xffffffffL
    require(sequence > 0 && length > 0 && offset + length <= BLOCK_BYTES)
    require(record.size == HEADER_BYTES + length + TAG_BYTES)
    val slot = (sequence % REPLAY_WINDOW).toInt()
    if (sequences[slot] == sequence || sequence <= highest - REPLAY_WINDOW) return null
    val nonce = ByteBuffer.allocate(12).putLong(0).putInt(sequence.toInt()).array()
    val bytes = cipher.decryptBytes(record.copyOfRange(HEADER_BYTES, record.size), nonce,
      record.copyOfRange(0, HEADER_BYTES))
    // Failed authentication must never advance the replay window.
    sequences[slot] = sequence
    highest = maxOf(highest, sequence)
    return Frame(id, bytes)
  }

  @Synchronized fun close() {
    closed = true
    cipher.destroy()
    sequences.fill(0)
  }
}
