package com.codexswitch.downloads

import java.nio.ByteBuffer

internal object PortStreamDeliveryChecks {
  private fun data(offset: Long, size: Int = 2, id: String = "socket") = PortStreamCipher.Frame(id,
    ByteBuffer.allocate(9 + size).put(1).putLong(offset).array())

  fun verify() {
    val delivery = PortStreamDelivery()
    check(delivery.keep(data(2))) // A gap must never hide bytes still missing on the other path.
    check(delivery.keep(data(0)))
    check(!delivery.keep(data(0)))
    check(delivery.keep(data(2)))
    check(!delivery.keep(data(0, 4)))
    check(delivery.keep(data(3, 3))) // Partial overlap contains new bytes and must still reach JS.
    check(!delivery.keep(data(0, 6)))
    check(delivery.keep(data(0, id = "other")))
    PortStreamCipherChecks.fails { delivery.keep(data(-1)) }
    PortStreamCipherChecks.fails { delivery.keep(data(9007199254740991L)) }
    check(delivery.keep(PortStreamCipher.Frame("socket", byteArrayOf(5))))
    check(delivery.keep(data(0)))
    repeat(129) { check(delivery.keep(data(0, id = "bounded-$it"))) }
    check(delivery.keep(data(0))) // Eviction can only allow a duplicate through; JS still deduplicates.
    delivery.clear()
    check(delivery.keep(data(0)))
  }
}
