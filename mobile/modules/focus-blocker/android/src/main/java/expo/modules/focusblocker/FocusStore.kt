package expo.modules.focusblocker

import android.content.Context

/**
 * État de la session partagé entre l'application (JS), les services et l'écran de blocage.
 * Stocké dans les SharedPreferences pour survivre à la fermeture de l'application et au redémarrage.
 *
 * Deux modes pour les applications :
 * - « block » : `packages` est la liste noire, tout le reste est permis ;
 * - « allow » : `packages` est la liste blanche, toute autre application est bloquée.
 */
class FocusStore(context: Context) {
  companion object {
    const val MODE_BLOCK = "block"
    const val MODE_ALLOW = "allow"
    /** Aucun filtre « Ne pas déranger » à restaurer. */
    const val NO_FILTER = -1
  }

  private val prefs = context.applicationContext.getSharedPreferences("focus_blocker", Context.MODE_PRIVATE)

  val startAt: Long get() = prefs.getLong("start_at", 0L)
  val endAt: Long get() = prefs.getLong("end_at", 0L)
  val intention: String get() = prefs.getString("intention", "") ?: ""
  val mode: String get() = prefs.getString("mode", MODE_BLOCK) ?: MODE_BLOCK
  val packages: Set<String> get() = prefs.getStringSet("packages", emptySet()) ?: emptySet()
  val blockApps: Boolean get() = prefs.getBoolean("block_apps", true)
  val blockSites: Boolean get() = prefs.getBoolean("block_sites", false)
  val domains: Set<String> get() = prefs.getStringSet("domains", emptySet()) ?: emptySet()
  val silence: Boolean get() = prefs.getBoolean("silence", false)
  val blockedCount: Int get() = prefs.getInt("blocked_count", 0)
  val lastBlocked: String get() = prefs.getString("last_blocked", "") ?: ""
  val lastBlockedAt: Long get() = prefs.getLong("last_blocked_at", 0L)

  /** Filtre « Ne pas déranger » en place avant la session (NO_FILTER : rien à restaurer). */
  var previousFilter: Int
    get() = prefs.getInt("previous_filter", NO_FILTER)
    set(value) = prefs.edit().putInt("previous_filter", value).apply()

  /** Ouvrir l'application au démarrage du téléphone. */
  var openAtBoot: Boolean
    get() = prefs.getBoolean("open_at_boot", true)
    set(value) = prefs.edit().putBoolean("open_at_boot", value).apply()

  /** Numéro du dernier démarrage pour lequel l'application a été ouverte (une seule fois par démarrage). */
  var bootOpenedFor: Int
    get() = prefs.getInt("boot_opened_for", -1)
    set(value) = prefs.edit().putInt("boot_opened_for", value).apply()

  fun isActive(now: Long = System.currentTimeMillis()) = endAt > now

  fun start(
    startAt: Long, endAt: Long, intention: String, blockApps: Boolean, mode: String, packages: Collection<String>,
    blockSites: Boolean, domains: Collection<String>, silence: Boolean
  ) {
    prefs.edit()
      .putLong("start_at", startAt)
      .putLong("end_at", endAt)
      .putString("intention", intention)
      .putBoolean("block_apps", blockApps)
      .putString("mode", if (mode == MODE_ALLOW) MODE_ALLOW else MODE_BLOCK)
      .putStringSet("packages", packages.toSet())
      .putBoolean("block_sites", blockSites)
      .putStringSet("domains", domains.map(::normalizeDomain).filter { it.isNotEmpty() }.toSet())
      .putBoolean("silence", silence)
      .putInt("blocked_count", 0)
      .putString("last_blocked", "")
      .putLong("last_blocked_at", 0L)
      .apply()
  }

  fun setLists(mode: String, packages: Collection<String>, domains: Collection<String>) {
    prefs.edit()
      .putString("mode", if (mode == MODE_ALLOW) MODE_ALLOW else MODE_BLOCK)
      .putStringSet("packages", packages.toSet())
      .putStringSet("domains", domains.map(::normalizeDomain).filter { it.isNotEmpty() }.toSet())
      .apply()
  }

  /** Les sites ne sont plus filtrés (VPN refusé ou coupé par l'utilisateur). */
  fun disableSites() = prefs.edit().putBoolean("block_sites", false).apply()

  fun stop() {
    prefs.edit().putLong("end_at", 0L).apply()
  }

  fun recordBlock(pkg: String) {
    prefs.edit()
      .putInt("blocked_count", blockedCount + 1)
      .putString("last_blocked", pkg)
      .putLong("last_blocked_at", System.currentTimeMillis())
      .apply()
  }
}

/** « https://www.Site.com/page » → « site.com » ; "" si ce n'est pas un nom de domaine. */
fun normalizeDomain(raw: String): String {
  var d = raw.trim().lowercase().removePrefix("https://").removePrefix("http://")
  d = d.substringBefore('/').substringBefore(':').removePrefix("www.").trimEnd('.')
  return if (Regex("^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z0-9-]{2,63}$").matches(d) && d.length <= 253) d else ""
}

/** Vrai si `host` est l'un des domaines bloqués ou l'un de leurs sous-domaines (m., www., api.…). */
fun isDomainBlocked(host: String, domains: Set<String>): Boolean {
  var h = host.lowercase().trimEnd('.')
  while (true) {
    if (h in domains) return true
    val dot = h.indexOf('.')
    if (dot < 0) return false
    h = h.substring(dot + 1)
  }
}
