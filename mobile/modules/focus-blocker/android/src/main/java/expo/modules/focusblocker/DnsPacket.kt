package expo.modules.focusblocker

/**
 * Lecture et écriture des paquets IPv4/UDP/DNS qui transitent par le VPN local.
 * Fonctions pures (sans Android) : testées par DnsPacketTest.
 */
class DnsQuery(
  val srcIp: ByteArray,
  val dstIp: ByteArray,
  val srcPort: Int,
  val dstPort: Int,
  /** Message DNS (sans les en-têtes IP et UDP). */
  val dns: ByteArray,
  /** Nom demandé, en minuscules, sans point final. */
  val name: String
)

object DnsPacket {
  /** Requête DNS IPv4/UDP vers le port 53, ou null pour tout autre paquet. */
  fun parse(packet: ByteArray, length: Int): DnsQuery? {
    if (length < 28 || (packet[0].toInt() ushr 4) != 4) return null
    val ihl = (packet[0].toInt() and 0x0F) * 4
    if (ihl < 20 || length < ihl + 8 || (packet[9].toInt() and 0xFF) != 17) return null
    val total = minOf(length, u16(packet, 2))
    val dstPort = u16(packet, ihl + 2)
    if (dstPort != 53) return null
    val udpLen = u16(packet, ihl + 4)
    val dnsStart = ihl + 8
    val dnsEnd = minOf(total, ihl + udpLen)
    if (dnsEnd - dnsStart < 12) return null
    val dns = packet.copyOfRange(dnsStart, dnsEnd)
    val name = questionName(dns) ?: return null
    return DnsQuery(
      packet.copyOfRange(12, 16), packet.copyOfRange(16, 20), u16(packet, ihl), dstPort, dns, name
    )
  }

  /** Nom de la première question, ou null si le message est malformé. */
  fun questionName(dns: ByteArray): String? = questionEnd(dns)?.first

  /** Réponse « ce domaine n'existe pas » (NXDOMAIN) à la requête, question recopiée. */
  fun nxdomain(query: ByteArray): ByteArray {
    val end = questionEnd(query)?.second ?: 12
    val out = query.copyOf(end)
    out[2] = (0x80 or (query[2].toInt() and 0x79)).toByte() // QR=1, opcode et RD repris
    out[3] = (0x80 or 0x03).toByte() // RA=1, RCODE=3
    for (i in 6 until 12) out[i] = 0 // aucune réponse, autorité ni donnée additionnelle
    if (end == 12) {
      out[4] = 0
      out[5] = 0
    } else {
      out[4] = 0
      out[5] = 1 // une seule question recopiée
    }
    return out
  }

  /** Paquet IPv4/UDP qui renvoie `dns` à l'application qui a envoyé `query`. */
  fun response(query: DnsQuery, dns: ByteArray): ByteArray {
    val total = 20 + 8 + dns.size
    val p = ByteArray(total)
    p[0] = 0x45
    put16(p, 2, total)
    p[6] = 0x40 // ne pas fragmenter
    p[8] = 64 // TTL
    p[9] = 17 // UDP
    query.dstIp.copyInto(p, 12)
    query.srcIp.copyInto(p, 16)
    put16(p, 10, checksum(p, 0, 20))
    put16(p, 20, query.dstPort)
    put16(p, 22, query.srcPort)
    put16(p, 24, 8 + dns.size)
    // Somme de contrôle UDP à 0 : facultative en IPv4.
    dns.copyInto(p, 28)
    return p
  }

  internal fun checksum(b: ByteArray, off: Int, len: Int): Int {
    var sum = 0L
    var i = off
    while (i < off + len - 1) {
      sum += u16(b, i)
      i += 2
    }
    if (len % 2 == 1) sum += ((b[off + len - 1].toInt() and 0xFF) shl 8).toLong()
    while (sum shr 16 != 0L) sum = (sum and 0xFFFF) + (sum shr 16)
    return (sum.inv() and 0xFFFF).toInt()
  }

  /** (nom, position juste après la première question) ; null si malformé ou compressé. */
  private fun questionEnd(dns: ByteArray): Pair<String, Int>? {
    if (dns.size < 12 || u16(dns, 4) < 1) return null
    val labels = mutableListOf<String>()
    var i = 12
    while (true) {
      if (i >= dns.size) return null
      val len = dns[i].toInt() and 0xFF
      if (len == 0) break
      if (len > 63 || i + 1 + len > dns.size) return null
      labels += String(dns, i + 1, len, Charsets.US_ASCII).lowercase()
      i += 1 + len
    }
    val end = i + 1 + 4 // octet nul, puis type et classe
    if (end > dns.size) return null
    return labels.joinToString(".") to end
  }

  private fun u16(b: ByteArray, i: Int) = ((b[i].toInt() and 0xFF) shl 8) or (b[i + 1].toInt() and 0xFF)

  private fun put16(b: ByteArray, i: Int, v: Int) {
    b[i] = (v ushr 8).toByte()
    b[i + 1] = v.toByte()
  }
}
