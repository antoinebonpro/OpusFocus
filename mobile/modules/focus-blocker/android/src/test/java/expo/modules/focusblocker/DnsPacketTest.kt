package expo.modules.focusblocker

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DnsPacketTest {
  /** Requête DNS « A » pour `name`, avec un enregistrement EDNS en données additionnelles. */
  private fun dnsQuery(name: String, id: Int = 0x1234): ByteArray {
    val out = mutableListOf<Byte>()
    out += listOf(id ushr 8, id and 0xFF, 0x01, 0x00, 0, 1, 0, 0, 0, 0, 0, 1).map { it.toByte() }
    for (label in name.split('.')) {
      out += label.length.toByte()
      out += label.toByteArray().toList()
    }
    out += listOf(0, 0, 1, 0, 1).map { it.toByte() } // fin du nom, type A, classe IN
    out += listOf(0, 0, 41, 0x10, 0, 0, 0, 0, 0, 0, 0).map { it.toByte() } // OPT
    return out.toByteArray()
  }

  /** Paquet IPv4/UDP 10.111.222.1:40000 → 10.111.222.2:53 contenant `dns`. */
  private fun ipPacket(dns: ByteArray, protocol: Int = 17, port: Int = 53): ByteArray {
    val p = ByteArray(28 + dns.size)
    p[0] = 0x45
    p[2] = ((28 + dns.size) ushr 8).toByte(); p[3] = (28 + dns.size).toByte()
    p[8] = 64; p[9] = protocol.toByte()
    byteArrayOf(10, 111, 222.toByte(), 1).copyInto(p, 12)
    byteArrayOf(10, 111, 222.toByte(), 2).copyInto(p, 16)
    p[20] = (40000 ushr 8).toByte(); p[21] = 40000.toByte()
    p[22] = (port ushr 8).toByte(); p[23] = port.toByte()
    p[24] = ((8 + dns.size) ushr 8).toByte(); p[25] = (8 + dns.size).toByte()
    dns.copyInto(p, 28)
    return p
  }

  @Test fun parsesQueryName() {
    val dns = dnsQuery("WWW.YouTube.com")
    val q = DnsPacket.parse(ipPacket(dns), 28 + dns.size)
    assertNotNull(q)
    assertEquals("www.youtube.com", q!!.name)
    assertEquals(40000, q.srcPort)
    assertEquals(53, q.dstPort)
  }

  @Test fun ignoresNonDnsTraffic() {
    val dns = dnsQuery("a.com")
    assertNull(DnsPacket.parse(ipPacket(dns, protocol = 6), 28 + dns.size)) // TCP
    assertNull(DnsPacket.parse(ipPacket(dns, port = 443), 28 + dns.size))
    assertNull(DnsPacket.parse(ByteArray(10), 10))
    val v6 = ipPacket(dns).also { it[0] = 0x60 }
    assertNull(DnsPacket.parse(v6, v6.size))
  }

  @Test fun rejectsMalformedNames() {
    val dns = dnsQuery("a.com")
    dns[12] = 60 // longueur de label qui dépasse le message
    assertNull(DnsPacket.questionName(dns))
    assertNull(DnsPacket.questionName(ByteArray(12)))
  }

  @Test fun nxdomainKeepsIdAndQuestionOnly() {
    val query = dnsQuery("tiktok.com", id = 0xBEEF)
    val r = DnsPacket.nxdomain(query)
    assertEquals(0xBE.toByte(), r[0]); assertEquals(0xEF.toByte(), r[1])
    assertTrue(r[2].toInt() and 0x80 != 0) // c'est une réponse
    assertTrue(r[2].toInt() and 0x01 != 0) // récursion demandée, reprise
    assertEquals(3, r[3].toInt() and 0x0F) // NXDOMAIN
    assertEquals(1, r[5].toInt()) // une question
    for (i in 6 until 12) assertEquals(0, r[i].toInt()) // ni réponse ni EDNS
    assertEquals("tiktok.com", DnsPacket.questionName(r))
    assertEquals(12 + 12 + 4, r.size) // en-tête + nom (6 « tiktok » 3 « com » 0) + type/classe
  }

  @Test fun responseSwapsAddressesWithValidChecksum() {
    val dns = dnsQuery("a.com")
    val q = DnsPacket.parse(ipPacket(dns), 28 + dns.size)!!
    val answer = byteArrayOf(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12)
    val p = DnsPacket.response(q, answer)
    assertEquals(28 + answer.size, p.size)
    assertArrayEquals(byteArrayOf(10, 111, 222.toByte(), 2), p.copyOfRange(12, 16))
    assertArrayEquals(byteArrayOf(10, 111, 222.toByte(), 1), p.copyOfRange(16, 20))
    assertEquals(53, ((p[20].toInt() and 0xFF) shl 8) or (p[21].toInt() and 0xFF))
    assertEquals(40000, ((p[22].toInt() and 0xFF) shl 8) or (p[23].toInt() and 0xFF))
    assertEquals(0, DnsPacket.checksum(p, 0, 20)) // en-tête IP valide : la somme recalculée vaut 0
    assertArrayEquals(answer, p.copyOfRange(28, p.size))
  }

  @Test fun normalizesDomainsLikePc() {
    assertEquals("youtube.com", normalizeDomain(" https://www.YouTube.com/watch?v=1 "))
    assertEquals("lequipe.fr", normalizeDomain("lequipe.fr:443"))
    assertEquals("web.whatsapp.com", normalizeDomain("web.whatsapp.com"))
    assertEquals("", normalizeDomain("pas un domaine"))
    assertEquals("", normalizeDomain("localhost"))
    assertEquals("", normalizeDomain("evil.com\n6.6.6.6 bank.com"))
  }

  @Test fun blocksDomainAndSubdomainsOnly() {
    val blocked = setOf("youtube.com", "x.com")
    assertTrue(isDomainBlocked("youtube.com", blocked))
    assertTrue(isDomainBlocked("m.youtube.com", blocked))
    assertTrue(isDomainBlocked("WWW.YOUTUBE.COM.", blocked))
    assertTrue(isDomainBlocked("api.x.com", blocked))
    assertFalse(isDomainBlocked("notyoutube.com", blocked))
    assertFalse(isDomainBlocked("box.com", blocked))
    assertFalse(isDomainBlocked("google.com", blocked))
    assertFalse(isDomainBlocked("com", blocked))
  }
}
