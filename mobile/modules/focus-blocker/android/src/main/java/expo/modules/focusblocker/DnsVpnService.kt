package expo.modules.focusblocker

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.VpnService
import android.os.ParcelFileDescriptor
import android.system.Os
import android.system.OsConstants
import android.system.StructPollfd
import android.util.Log
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetAddress
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Bloque les sites pendant une session, comme le fichier hosts sur PC.
 *
 * VPN local : seul le trafic DNS y passe (une seule route, vers un serveur DNS fictif). Les requêtes
 * pour un domaine bloqué reçoivent « ce domaine n'existe pas » ; les autres sont transmises au DNS du
 * réseau. Aucune donnée ne quitte le téléphone autrement que par cette transmission normale.
 */
class DnsVpnService : VpnService() {
  companion object {
    private const val TAG = "OpusFocusVpn"
    private const val ACTION_STOP = "expo.modules.focusblocker.VPN_STOP"
    private const val VPN_ADDRESS = "10.111.222.1"
    private const val DNS_ADDRESS = "10.111.222.2"
    private val FALLBACK_DNS = listOf("1.1.1.1", "8.8.8.8")

    @Volatile var running = false
      private set

    fun start(context: Context): Boolean {
      if (prepare(context) != null) return false // autorisation VPN pas (ou plus) accordée
      return try {
        context.startService(Intent(context, DnsVpnService::class.java))
        true
      } catch (e: Exception) {
        Log.w(TAG, "démarrage impossible", e)
        false
      }
    }

    fun stop(context: Context) {
      if (!running) return
      try {
        context.startService(Intent(context, DnsVpnService::class.java).setAction(ACTION_STOP))
      } catch (e: Exception) {
        Log.w(TAG, "arrêt par intent impossible", e)
      }
    }
  }

  private var tun: ParcelFileDescriptor? = null
  private var worker: Thread? = null
  @Volatile private var stopping = false
  private var pool: ExecutorService? = null
  @Volatile private var upstream: List<InetAddress> = emptyList()
  @Volatile private var upstreamAt = 0L

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val store = FocusStore(this)
    if (intent?.action == ACTION_STOP || !store.isActive() || !store.blockSites) {
      shutdown()
      stopSelf()
      return START_NOT_STICKY
    }
    if (tun == null) establish()
    return START_STICKY
  }

  private fun establish() {
    refreshUpstream(force = true)
    val open = PendingIntent.getActivity(
      this, 0, packageManager.getLaunchIntentForPackage(packageName), PendingIntent.FLAG_IMMUTABLE
    )
    val builder = Builder()
      .setSession("OpusFocus — sites bloqués")
      .addAddress(VPN_ADDRESS, 32)
      .addDnsServer(DNS_ADDRESS)
      .addRoute(DNS_ADDRESS, 32)
      .setConfigureIntent(open)
      .setBlocking(false)
    try {
      builder.addDisallowedApplication(packageName) // nos propres requêtes vers le DNS réel ne repassent pas ici
    } catch (e: Exception) {
      Log.w(TAG, "exclusion impossible", e)
    }
    tun = try {
      builder.establish()
    } catch (e: Exception) {
      Log.w(TAG, "établissement impossible", e)
      null
    }
    if (tun == null) {
      FocusStore(this).disableSites()
      stopSelf()
      return
    }
    stopping = false
    running = true
    pool = Executors.newFixedThreadPool(4)
    worker = Thread(::loop, "opusfocus-dns").also { it.start() }
  }

  private fun loop() {
    val fd = tun ?: return
    val input = FileInputStream(fd.fileDescriptor)
    val output = FileOutputStream(fd.fileDescriptor)
    val buffer = ByteArray(32767)
    val poll = StructPollfd().apply {
      this.fd = fd.fileDescriptor
      events = OsConstants.POLLIN.toShort()
    }
    try {
      while (!stopping) {
        if (Os.poll(arrayOf(poll), 1000) <= 0) continue
        val n = input.read(buffer)
        if (n <= 0) continue
        val query = DnsPacket.parse(buffer, n) ?: continue
        val domains = FocusStore(this).domains
        if (isDomainBlocked(query.name, domains)) {
          write(output, DnsPacket.response(query, DnsPacket.nxdomain(query.dns)))
        } else {
          pool?.execute { forward(query, output) }
        }
      }
    } catch (e: Exception) {
      if (!stopping) Log.w(TAG, "boucle interrompue", e)
    }
  }

  /** Transmet la requête au DNS du réseau (puis aux DNS publics en secours) et renvoie sa réponse. */
  private fun forward(query: DnsQuery, output: FileOutputStream) {
    refreshUpstream(force = false)
    for (server in upstream) {
      try {
        DatagramSocket().use { socket ->
          protect(socket)
          socket.soTimeout = 2500
          socket.send(DatagramPacket(query.dns, query.dns.size, server, 53))
          val buf = ByteArray(4096)
          val reply = DatagramPacket(buf, buf.size)
          socket.receive(reply)
          write(output, DnsPacket.response(query, buf.copyOf(reply.length)))
        }
        return
      } catch (e: Exception) {
        // Serveur muet ou injoignable : on essaie le suivant.
      }
    }
  }

  private fun write(output: FileOutputStream, packet: ByteArray) {
    synchronized(output) {
      try {
        output.write(packet)
      } catch (e: Exception) {
        if (!stopping) Log.w(TAG, "écriture impossible", e)
      }
    }
  }

  /** DNS du réseau réel (Wi-Fi ou données), relu toutes les 30 s pour suivre les changements de réseau. */
  private fun refreshUpstream(force: Boolean) {
    val now = System.currentTimeMillis()
    if (!force && now - upstreamAt < 30_000) return
    upstreamAt = now
    val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val system = mutableListOf<InetAddress>()
    @Suppress("DEPRECATION")
    for (network in cm.allNetworks) {
      val caps = cm.getNetworkCapabilities(network) ?: continue
      if (caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) continue
      if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) continue
      cm.getLinkProperties(network)?.dnsServers?.filterIsInstance<Inet4Address>()?.let { system += it }
    }
    upstream = (system + FALLBACK_DNS.map(InetAddress::getByName)).distinct()
  }

  override fun onRevoke() {
    // L'utilisateur a coupé le VPN dans les réglages : les sites ne sont plus bloqués.
    FocusStore(this).disableSites()
    shutdown()
    super.onRevoke()
  }

  override fun onDestroy() {
    shutdown()
    super.onDestroy()
  }

  private fun shutdown() {
    stopping = true
    running = false
    worker?.interrupt()
    worker = null
    pool?.shutdownNow()
    pool = null
    try {
      tun?.close()
    } catch (e: Exception) {
      // Déjà fermé.
    }
    tun = null
  }
}
