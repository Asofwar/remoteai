package com.codexswitch.downloads

import com.codexswitch.crypto.PacketCipher
import java.nio.ByteBuffer
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

internal object PortStreamCipherChecks {
  val key = "07".repeat(32)
  val request = UUID.fromString("33333333-3333-4333-8333-333333333333")
  val plain = byteArrayOf(1, 0, 0, 0, 0, 0, 0, 0, 0, 42, -1)

  fun payload(sequence: Int) = plain.copyOf().also {
    ByteBuffer.wrap(it).putLong(1, ((sequence.toLong() and 0xffffffffL) - 1) * (plain.size - 9))
  }

  fun record(id: UUID, epoch: UUID, sequence: Int = 1, payload: ByteArray = payload(sequence)): ByteBuffer {
    val header = ByteBuffer.allocate(72).putInt(0x52414231).putInt(0x01010048)
      .putLong(id.mostSignificantBits).putLong(id.leastSignificantBits)
      .putLong(epoch.mostSignificantBits).putLong(epoch.leastSignificantBits)
      .putLong(request.mostSignificantBits).putLong(request.leastSignificantBits)
      .putInt(0).putInt(0).putInt(payload.size).putInt(sequence).array()
    val nonce = ByteBuffer.allocate(12).putLong(0).putInt(sequence).array()
    val cipher = Cipher.getInstance(PacketCipher.TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(PacketCipher.fromHex(key), "ChaCha20"), IvParameterSpec(nonce))
    cipher.updateAAD(header)
    return ByteBuffer.wrap(header + cipher.doFinal(payload))
  }

  fun fails(action: () -> Unit) {
    var failed = false
    try { action() } catch (_: Exception) { failed = true }
    check(failed)
  }

  fun verify() {
    verifyNodeVector()
    PortStreamDeliveryChecks.verify()
    val id = UUID.randomUUID(); val epoch = UUID.randomUUID()
    val receiver = PortStreamCipher(key, id, epoch)
    try {
      check(receiver.decrypt(record(id, epoch, 2).array())?.bytes?.contentEquals(payload(2)) == true)
      check(receiver.decrypt(record(id, epoch).array())?.id == request.toString())
      check(receiver.decrypt(record(id, epoch).array()) == null)
      val forged = record(id, epoch, 5000).array().apply { this[lastIndex] = (this[lastIndex].toInt() xor 1).toByte() }
      fails { receiver.decrypt(forged) }
      check(receiver.decrypt(record(id, epoch, 3).array()) != null)
      fails { receiver.decrypt(record(UUID.randomUUID(), epoch, 4).array()) }
      fails { receiver.decrypt(record(id, UUID.randomUUID(), 4).array()) }
      fails { receiver.decrypt(record(id, epoch, 0).array()) }
      fails { receiver.decrypt(record(id, epoch, 4).array().apply { this[4] = 2 }) }
      check(receiver.decrypt(record(id, epoch, 4098).array()) != null)
      check(receiver.decrypt(record(id, epoch, 2).array()) == null)
      check(receiver.decrypt(record(id, epoch, 4).array()) != null)
      check(receiver.decrypt(record(id, epoch, -1).array()) != null)
      check(receiver.decrypt(record(id, epoch, -1).array()) == null)
    } finally { receiver.close() }
    fails { receiver.decrypt(record(id, epoch, 5).array()) }
  }

  private fun verifyNodeVector() {
    // Node crypto.createCipheriv('chacha20-poly1305'): independent wire-format known answer.
    val vector = "52414231010100481111111111114111811111111111111122222222222242228222222222222222" +
      "3333333333334333833333333333333300000000000000000000000b00000001" +
      "e8175316c66d6644c2ae86dd00c5f524698df431bfc0f84e80bce6"
    val receiver = PortStreamCipher(key, UUID.fromString("11111111-1111-4111-8111-111111111111"),
      UUID.fromString("22222222-2222-4222-8222-222222222222"))
    try { check(receiver.decrypt(PacketCipher.fromHex(vector))?.bytes?.contentEquals(plain) == true) }
    finally { receiver.close() }
  }
}
