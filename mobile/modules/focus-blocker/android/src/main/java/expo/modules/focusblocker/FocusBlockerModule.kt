package expo.modules.focusblocker

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.net.Uri
import android.net.VpnService
import android.provider.Settings
import android.util.Base64
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.ByteArrayOutputStream

/** Ce que l'utilisateur a choisi pour la session (même contenu que sur PC). */
class SessionOptions : Record {
  @Field var startAt: Double = 0.0
  @Field var endAt: Double = 0.0
  @Field var intention: String = ""
  @Field var blockApps: Boolean = true
  @Field var mode: String = FocusStore.MODE_BLOCK
  @Field var packages: List<String> = emptyList()
  @Field var blockSites: Boolean = false
  @Field var domains: List<String> = emptyList()
  @Field var silence: Boolean = false
}

class FocusBlockerModule : Module() {
  private companion object {
    const val VPN_REQUEST = 4711
  }

  private var vpnPromise: Promise? = null

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("FocusBlocker")

    /** Applications visibles dans le lanceur, avec leur icône en PNG base64 et leur catégorie. */
    AsyncFunction("getInstalledApps") {
      val pm = context.packageManager
      val browsers = pm.queryIntentActivities(Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com")), PackageManager.MATCH_ALL)
        .map { it.activityInfo.packageName }.toSet()
      pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0)
        .map { it.activityInfo.applicationInfo }
        .distinctBy { it.packageName }
        .filter { it.packageName != context.packageName }
        .map { info ->
          mapOf(
            "packageName" to info.packageName,
            "label" to pm.getApplicationLabel(info).toString(),
            "icon" to iconBase64(pm.getApplicationIcon(info)),
            "category" to category(info, browsers)
          )
        }
        .sortedBy { (it["label"] as String).lowercase() }
    }

    Function("isServiceEnabled") {
      val enabled = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES).orEmpty()
      val ours = ComponentName(context, FocusBlockerService::class.java)
      enabled.split(':').any { ComponentName.unflattenFromString(it) == ours }
    }

    Function("openAccessibilitySettings") {
      context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /** Fiche de l'application : nécessaire sur Android 13+ pour « Autoriser les paramètres restreints ». */
    Function("openAppSettings") {
      context.startActivity(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
    }

    /** Applications toujours permises en mode liste blanche (accueil, téléphone, clavier, réglages). */
    Function("getEssentialPackages") {
      essentialPackages(context).toList()
    }

    // --- Notifications (« Ne pas déranger ») ---
    Function("isSilenceAllowed") { Silence.allowed(context) }

    Function("openSilenceSettings") {
      context.startActivity(Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    // --- Sites web (VPN local) ---
    Function("isVpnAllowed") { VpnService.prepare(context) == null }

    /** Demande l'autorisation VPN (une seule fois). Résout true si elle est accordée. */
    AsyncFunction("prepareVpn") { promise: Promise ->
      val intent = VpnService.prepare(context)
      val activity = appContext.currentActivity
      when {
        intent == null -> promise.resolve(true)
        activity == null -> promise.resolve(false)
        else -> {
          vpnPromise?.resolve(false)
          vpnPromise = promise
          activity.startActivityForResult(intent, VPN_REQUEST)
        }
      }
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode == VPN_REQUEST) {
        vpnPromise?.resolve(payload.resultCode == Activity.RESULT_OK)
        vpnPromise = null
      }
    }

    // --- Session ---
    /** Démarre la session et renvoie les protections qui n'ont pas pu être activées. */
    Function("startSession") { o: SessionOptions ->
      FocusStore(context).start(
        o.startAt.toLong(), o.endAt.toLong(), o.intention, o.blockApps, o.mode, o.packages, o.blockSites, o.domains, o.silence
      )
      Session.start(context)
    }

    Function("updateLists") { mode: String, packages: List<String>, domains: List<String> ->
      FocusStore(context).setLists(mode, packages, domains)
    }

    Function("stopSession") {
      Session.stop(context)
    }

    Function("getStatus") {
      val store = FocusStore(context)
      mapOf(
        "active" to store.isActive(),
        "endAt" to store.endAt.toDouble(),
        "blockedCount" to store.blockedCount,
        "lastBlocked" to label(store.lastBlocked),
        "lastBlockedAt" to store.lastBlockedAt.toDouble(),
        "sites" to (store.isActive() && store.blockSites && DnsVpnService.running)
      )
    }

    // --- Démarrage ---
    Function("getOpenAtBoot") { FocusStore(context).openAtBoot }

    Function("setOpenAtBoot") { enabled: Boolean ->
      FocusStore(context).openAtBoot = enabled
    }
  }

  private fun label(pkg: String): String {
    if (pkg.isEmpty()) return ""
    return try {
      val pm = context.packageManager
      pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
    } catch (e: Exception) {
      pkg
    }
  }

  /** Mêmes familles que sur PC : réseaux et messagerie, jeux, vidéo et musique, navigateurs, autres. */
  private fun category(info: ApplicationInfo, browsers: Set<String>): String {
    if (info.packageName in browsers) return "browsers"
    return when (info.category) {
      ApplicationInfo.CATEGORY_GAME -> "games"
      ApplicationInfo.CATEGORY_SOCIAL -> "social"
      ApplicationInfo.CATEGORY_VIDEO, ApplicationInfo.CATEGORY_AUDIO, ApplicationInfo.CATEGORY_NEWS -> "media"
      else -> @Suppress("DEPRECATION") if (info.flags and ApplicationInfo.FLAG_IS_GAME != 0) "games" else "other"
    }
  }

  private fun iconBase64(drawable: android.graphics.drawable.Drawable): String {
    val size = 96
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    drawable.setBounds(0, 0, size, size)
    drawable.draw(Canvas(bitmap))
    val out = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
    bitmap.recycle()
    return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
  }
}
