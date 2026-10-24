package expo.modules.focusblocker

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.util.Log

/**
 * Service au premier plan pendant toute la session : notification avec compte à rebours, et fin de
 * session à l'heure prévue même si l'application est fermée (comme le moteur PC qui tourne en fond).
 */
class SessionService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private val endRunnable = Runnable { Session.complete(this) }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val store = FocusStore(this)
    // Toujours passer au premier plan d'abord : un service lancé ainsi qui s'arrête sans le faire plante l'application.
    val notification = Session.ongoingNotification(this, store)
    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(Session.ONGOING_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(Session.ONGOING_ID, notification)
    }
    if (!store.isActive()) {
      Session.complete(this)
      return START_NOT_STICKY
    }
    if (store.blockSites && !DnsVpnService.running && !DnsVpnService.start(this)) store.disableSites()
    handler.removeCallbacks(endRunnable)
    handler.postDelayed(endRunnable, maxOf(0L, store.endAt - System.currentTimeMillis()))
    return START_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacks(endRunnable)
    super.onDestroy()
  }
}

/** Réveil de secours : termine la session si le service a été arrêté par le système. */
class SessionEndReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (FocusStore(context).endAt > 0 && !FocusStore(context).isActive()) Session.complete(context)
  }
}

/** Au démarrage du téléphone : reprend la session en cours (ou la clôt) et ouvre l'application. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != "android.intent.action.QUICKBOOT_POWERON") return
    val store = FocusStore(context)
    if (store.isActive()) {
      Session.resume(context)
    } else {
      Session.complete(context, notify = store.endAt > 0)
    }
    // Une seule ouverture par démarrage réel : le récepteur est exporté, une diffusion imitée ne doit rien rouvrir.
    Session.openAtBootOnce(context)
  }
}

object Session {
  private const val TAG = "OpusFocus"
  const val ONGOING_ID = 4201
  private const val END_ID = 4202
  private const val CHANNEL_ONGOING = "opusfocus_session"
  private const val CHANNEL_END = "opusfocus_session_end"

  /** Démarre la session décrite dans le FocusStore. Renvoie les protections qui n'ont pas pu être activées. */
  fun start(context: Context): List<String> {
    val store = FocusStore(context)
    val warnings = mutableListOf<String>()
    if (store.silence && !Silence.enable(context)) {
      warnings += "Les notifications n'ont pas été coupées : autorise l'accès « Ne pas déranger »."
    }
    if (store.blockSites && VpnServiceCompat.needsConsent(context)) {
      store.disableSites()
      warnings += "Les sites ne sont pas bloqués : autorise le VPN d'OpusFocus."
    }
    resume(context)
    scheduleBackupEnd(context, store.endAt)
    return warnings
  }

  fun resume(context: Context) {
    val store = FocusStore(context)
    if (store.silence) Silence.enable(context)
    try {
      context.startForegroundService(Intent(context, SessionService::class.java))
    } catch (e: Exception) {
      // Service impossible à lancer ici : les blocages restent actifs, le réveil de secours clôt la session.
      Log.w(TAG, "service de session impossible à démarrer", e)
      if (store.blockSites && !DnsVpnService.start(context)) store.disableSites()
    }
  }

  /** Arrêt avant la fin (depuis l'application) : on lève tout, sans notification de fin. */
  fun stop(context: Context) {
    FocusStore(context).stop()
    release(context)
  }

  /** Fin à l'heure prévue : on lève tout, on prévient l'utilisateur et on rouvre l'application pour le bilan. */
  fun complete(context: Context, notify: Boolean = true) {
    val store = FocusStore(context)
    val hadSession = store.endAt > 0
    store.stop()
    release(context)
    if (notify && hadSession) {
      postEndNotification(context, store.intention)
      openApp(context)
    }
  }

  private fun release(context: Context) {
    Silence.restore(context)
    DnsVpnService.stop(context)
    context.stopService(Intent(context, SessionService::class.java))
    (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(endIntent(context))
  }

  /** Ouvre l'application (fin de session, démarrage du téléphone). Android peut l'interdire en arrière-plan. */
  fun openApp(context: Context) {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
    try {
      context.startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED))
    } catch (e: Exception) {
      Log.w(TAG, "ouverture de l'application refusée", e)
    }
  }

  /** Ouvre l'application une seule fois par démarrage du téléphone, si l'utilisateur l'a demandé. */
  fun openAtBootOnce(context: Context) {
    val store = FocusStore(context)
    if (!store.openAtBoot || SystemClock.elapsedRealtime() > 5 * 60_000) return
    val boot = Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT, -1)
    if (boot == store.bootOpenedFor) return
    store.bootOpenedFor = boot
    openApp(context)
  }

  private fun scheduleBackupEnd(context: Context, endAt: Long) {
    val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endAt + 5_000, endIntent(context))
  }

  private fun endIntent(context: Context) = PendingIntent.getBroadcast(
    context, 0, Intent(context, SessionEndReceiver::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
  )

  private fun openAppIntent(context: Context) = PendingIntent.getActivity(
    context, 0,
    context.packageManager.getLaunchIntentForPackage(context.packageName)?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
  )

  private fun channels(context: Context) {
    val nm = context.getSystemService(NotificationManager::class.java)
    nm.createNotificationChannel(
      NotificationChannel(CHANNEL_ONGOING, "Session en cours", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Temps restant de la session de concentration."
        setShowBadge(false)
      }
    )
    nm.createNotificationChannel(
      NotificationChannel(CHANNEL_END, "Fin de session", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Prévient quand la session est terminée."
      }
    )
  }

  fun ongoingNotification(context: Context, store: FocusStore): Notification {
    channels(context)
    val protections = buildList {
      if (store.blockApps) add("applications")
      if (store.blockSites) add("sites")
      if (store.silence) add("notifications")
    }
    val text = if (protections.isEmpty()) "Reste sur ta tâche." else "Bloqués : ${protections.joinToString(", ")}"
    return Notification.Builder(context, CHANNEL_ONGOING)
      .setSmallIcon(R.drawable.opusfocus_notification)
      .setContentTitle(store.intention.ifBlank { "Session de concentration" })
      .setContentText(text)
      .setWhen(store.endAt)
      .setShowWhen(true)
      .setUsesChronometer(true)
      .setChronometerCountDown(true)
      .setOngoing(true)
      .setCategory(Notification.CATEGORY_PROGRESS)
      .setContentIntent(openAppIntent(context))
      .apply { if (Build.VERSION.SDK_INT >= 31) setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE) }
      .build()
  }

  private fun postEndNotification(context: Context, intention: String) {
    channels(context)
    val notification = Notification.Builder(context, CHANNEL_END)
      .setSmallIcon(R.drawable.opusfocus_notification)
      .setContentTitle("Session terminée. Bien joué.")
      .setContentText(if (intention.isBlank()) "Fais ton bilan dans OpusFocus." else "« $intention » · fais ton bilan.")
      .setAutoCancel(true)
      .setCategory(Notification.CATEGORY_REMINDER)
      .setContentIntent(openAppIntent(context))
      .build()
    try {
      context.getSystemService(NotificationManager::class.java).notify(END_ID, notification)
    } catch (e: SecurityException) {
      Log.w(TAG, "notifications refusées", e)
    }
  }
}

/** Mode « Ne pas déranger » pendant la session, puis retour au réglage d'avant. */
object Silence {
  fun allowed(context: Context) = context.getSystemService(NotificationManager::class.java).isNotificationPolicyAccessGranted

  fun enable(context: Context): Boolean {
    val nm = context.getSystemService(NotificationManager::class.java)
    if (!nm.isNotificationPolicyAccessGranted) return false
    val store = FocusStore(context)
    if (store.previousFilter == FocusStore.NO_FILTER) store.previousFilter = nm.currentInterruptionFilter
    // « Prioritaires » : les appels et alarmes que l'utilisateur a autorisés passent toujours.
    nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_PRIORITY)
    return true
  }

  fun restore(context: Context) {
    val store = FocusStore(context)
    val previous = store.previousFilter
    if (previous == FocusStore.NO_FILTER) return
    val nm = context.getSystemService(NotificationManager::class.java)
    if (nm.isNotificationPolicyAccessGranted) {
      nm.setInterruptionFilter(if (previous == NotificationManager.INTERRUPTION_FILTER_UNKNOWN) NotificationManager.INTERRUPTION_FILTER_ALL else previous)
    }
    store.previousFilter = FocusStore.NO_FILTER
  }
}

object VpnServiceCompat {
  fun needsConsent(context: Context) = android.net.VpnService.prepare(context) != null
}
