package org.windstation.weatheredkiwi;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.provider.Settings;
import android.content.ComponentName;
import android.content.pm.PackageManager;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.webkit.GeolocationPermissions;
import android.os.Vibrator;
import android.os.VibrationEffect;
import android.view.HapticFeedbackConstants;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// Окно вокруг дашборда: тот же интерфейс, что в программе для Windows (один файл
// index.html). Он вшит в APK, а новее — скачивается «лентой» с компьютера
// (serve-phone.ps1 раздаёт <адрес>/feed/latest.json и index.html), как в
// настольной программе: мост window.wkUpdater тот же, вкладка «Обновление» —
// тоже. Лента ищется по сохранённому адресу, потом по адресу, вшитому при
// сборке, потом на Google Диске (Kiwi_Drop/updates, id файлов — assets/drive-feed.json:
// это и есть обновления вне дома), и только потом перебором соседей по сети.
// Сетевой ленте верим лишь с подписью sigP256 (ECDSA P-256, см. desktop/feed-sign.js):
// Ed25519, которой подписан sig для Windows, в Android есть только с 13-й версии.
public class MainActivity extends Activity {
    private static final int PORT = 8765;

    private static void toggle(PackageManager pm, ComponentName c, boolean on) {
        int want = on ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED : PackageManager.COMPONENT_ENABLED_STATE_DISABLED;
        int now = pm.getComponentEnabledSetting(c);
        // DEFAULT = как в манифесте: стеклянный включён, тональный выключен.
        boolean isOn = now == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT ? c.getClassName().endsWith(".MainActivity") : now == PackageManager.COMPONENT_ENABLED_STATE_ENABLED;
        if (isOn != on) pm.setComponentEnabledSetting(c, want, PackageManager.DONT_KILL_APP);
    }
    private static final String GDRIVE = "gdrive:";
    private static final String FEED_P256 =
        "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEw7hGp2C+XDtgE5ddluPNPSGSL4IFDHX4GEVKAcDug3maDrmc7iKPo6/Gp80cwl8T0zmE0SPMSF7LlKoMBcErIg==";
    private WebView web;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private SharedPreferences prefs;

    // состояние обновления
    private String status = "idle", error = "", current = "", feedBase = "", sha = "";
    private JSONObject info = null;
    private double progress = 0;
    // Что проверка УЗНАЛА: последняя версия в ленте, ответила ли хоть одна лента,
    // когда и откуда. Без этого «не достучались» выглядело как «обновлений нет».
    private String latestVer = "", via = "";
    // Самообновление самого APK: «О приложении» показывает versionName пакета, и
    // обновление одного интерфейса его не меняет. shell.json на Диске — свежий APK,
    // версия, хеш, подпись P-256. Новее своего — ставим через PackageInstaller.
    private static final String ACTION_INSTALLED = "org.windstation.weatheredkiwi.INSTALL_STATUS";
    private String shellLatest = "";
    private JSONObject shellInfo = null, feedMeta = null;
    private boolean reached = false;
    private long checkedAt = 0;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window w = getWindow();
        w.setStatusBarColor(Color.parseColor("#060a1a"));
        w.setNavigationBarColor(Color.parseColor("#04060f"));
        prefs = getSharedPreferences("wk", MODE_PRIVATE);

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#04060f"));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // настройки и станции живут в localStorage
        s.setAllowFileAccess(true);
        s.setAllowUniversalAccessFromFileURLs(true);   // запросы к станции http://192.168.4.1
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setMediaPlaybackRequiresUserGesture(false);

        web.addJavascriptInterface(new Bridge(), "WKNative");
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
                cb.invoke(origin, true, false);
            }
        });

        if (Build.VERSION.SDK_INT >= 23
                && checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { Manifest.permission.ACCESS_FINE_LOCATION }, 1);
        }
        // Ответ PackageInstaller: нужно подтверждение человека — показываем системное
        // окно «Установить»; ошибка — в интерфейс. Успех не приходит: процесс заменяют.
        BroadcastReceiver installStatus = new BroadcastReceiver() {
            @Override public void onReceive(Context ctx, Intent i) {
                int st = i.getIntExtra(PackageInstaller.EXTRA_STATUS, -999);
                if (st == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                    Intent confirm = i.getParcelableExtra(Intent.EXTRA_INTENT);
                    if (confirm != null) { confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); startActivity(confirm); }
                } else if (st != PackageInstaller.STATUS_SUCCESS) {
                    String m = i.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
                    status = "error";
                    error = st == PackageInstaller.STATUS_FAILURE_ABORTED ? "установка отменена" : "установка не удалась" + (m != null ? ": " + m : "");
                    push();
                }
            }
        };
        IntentFilter f = new IntentFilter(ACTION_INSTALLED);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(installStatus, f, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(installStatus, f);
        loadApp();
    }

    // ---------- версии и файлы ----------
    private String bundledVersion() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; }
        catch (Exception e) { return "0.0.0"; }
    }

    static int cmp(String a, String b) {
        String[] x = a.split("\\."), y = b.split("\\.");
        for (int i = 0; i < 3; i++) {
            int p = i < x.length ? parse(x[i]) : 0, q = i < y.length ? parse(y[i]) : 0;
            if (p != q) return p - q;
        }
        return 0;
    }
    private static int parse(String t) { try { return Integer.parseInt(t.trim()); } catch (Exception e) { return 0; } }

    private File updDir() { return new File(getFilesDir(), "updates"); }

    // Активное обновление — только если оно новее вшитого интерфейса.
    private File activeFile() {
        try {
            File a = new File(updDir(), "active.json");
            if (!a.exists()) return null;
            JSONObject j = new JSONObject(new String(readAll(new java.io.FileInputStream(a)), StandardCharsets.UTF_8));
            File f = new File(j.getString("file"));
            if (f.exists() && cmp(j.getString("version"), bundledVersion()) > 0) return f;
        } catch (Exception ignored) { }
        return null;
    }

    private String currentVersion() {
        try {
            File a = new File(updDir(), "active.json");
            if (a.exists() && activeFile() != null) {
                return new JSONObject(new String(readAll(new java.io.FileInputStream(a)), StandardCharsets.UTF_8)).getString("version");
            }
        } catch (Exception ignored) { }
        return bundledVersion();
    }

    private static byte[] readAll(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384]; int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
        return out.toByteArray();
    }

    private String readAsset(String name) throws Exception {
        return new String(readAll(getAssets().open(name)), StandardCharsets.UTF_8);
    }

    // Страница грузится из строки: мост window.wkUpdater вставляется в <head> до
    // любого скрипта интерфейса, иначе он не успел бы к первому рендеру.
    private void loadApp() {
        try {
            File f = activeFile();
            String html = f != null ? new String(readAll(new java.io.FileInputStream(f)), StandardCharsets.UTF_8)
                                    : readAsset("index.html");
            current = currentVersion();
            String shim = readAsset("bridge.js").replace("__CUR__", current);
            html = html.replaceFirst("(?i)<head[^>]*>", "$0<script>" + java.util.regex.Matcher.quoteReplacement(shim) + "</script>");
            web.loadDataWithBaseURL("file:///android_asset/", html, "text/html", "UTF-8", null);
        } catch (Exception e) {
            web.loadUrl("file:///android_asset/index.html");
        }
    }

    // ---------- обмен с интерфейсом ----------
    private void push() {
        final String js;
        try {
            JSONObject o = new JSONObject();
            o.put("status", status); o.put("current", current);
            o.put("info", info == null ? JSONObject.NULL : info);
            o.put("progress", progress); o.put("error", error);
            o.put("latest", latestVer); o.put("reached", reached); o.put("checkedAt", checkedAt); o.put("via", via);
            o.put("shell", bundledVersion()); o.put("shellLatest", shellLatest);
            js = "window.__wkPush&&window.__wkPush(" + o.toString() + ")";
        } catch (Exception e) { return; }
        runOnUiThread(new Runnable() { public void run() { web.evaluateJavascript(js, null); } });
    }

    class Bridge {
        @JavascriptInterface public void check() { io.execute(new Runnable() { public void run() { doCheck(); } }); }
        @JavascriptInterface public void install() { io.execute(new Runnable() { public void run() { doInstall(); } }); }
        @JavascriptInterface public void setFeed(String url) { prefs.edit().putString("feed", url).apply(); }
        // Заряд самого телефона: "процент,идёт_зарядка" — для значка в шапке, когда станция не на связи.
        @JavascriptInterface public String battery() {
            try {
                Intent b = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
                if (b == null) return "-1,0";
                int level = b.getIntExtra("level", -1), scale = b.getIntExtra("scale", 100), st = b.getIntExtra("status", -1);
                boolean chg = st == 2 || st == 5;            // BATTERY_STATUS_CHARGING / FULL
                return (scale > 0 ? Math.round(level * 100f / scale) : -1) + "," + (chg ? 1 : 0);
            } catch (Exception e) { return "-1,0"; }
        }
        // Компас ветра: азимут телефона из родного датчика → window.__wkHeading(градусы).
        @JavascriptInterface public void startCompass() { compassWanted = true; runOnUiThread(new Runnable() { public void run() { compassOn(); } }); }
        @JavascriptInterface public void stopCompass() { compassWanted = false; runOnUiThread(new Runnable() { public void run() { compassOff(); } }); }
        // Место по запросу: GPS и сеть → window.__wkLoc({lat, lon, acc}) либо {error}.
        @JavascriptInterface public void getLocation() { runOnUiThread(new Runnable() { public void run() { locate(); } }); }
        // Виджеты рабочего стола: последнее показание и куда за ним ходить без приложения.
        // Значок на рабочем столе: "glass" или "tonal" (тумблер «Liquid Glass иконка»).
        // Два ярлыка-alias в манифесте, включён ровно один. Трогаем только когда
        // состояние действительно меняется: переключение компонента лаунчер замечает
        // не сразу и на части телефонов на миг убирает значок с экрана.
        @JavascriptInterface public void setIcon(final String kind) {
            final boolean tonal = "tonal".equals(kind);
            runOnUiThread(new Runnable() { public void run() {
                try {
                    PackageManager pm = getPackageManager();
                    ComponentName glass = new ComponentName(MainActivity.this, getPackageName() + ".MainActivity");
                    ComponentName ton = new ComponentName(MainActivity.this, getPackageName() + ".TonalLauncher");
                    toggle(pm, tonal ? ton : glass, true);
                    toggle(pm, tonal ? glass : ton, false);
                } catch (Exception e) { /* старый лаунчер — значок остаётся прежним */ }
            } });
        }
        @JavascriptInterface public void widget(String json) { WindWidget.store(getApplicationContext(), json); }
        // Уведомления. Сколько и когда — решает дашборд (wind-notify.js, не больше 33
        // в сутки); здесь только показать. tag — одно уведомление на тему: новая
        // сводка заменяет прежнюю, а не ложится стопкой.
        @JavascriptInterface public boolean notifyAllowed() {
            if (Build.VERSION.SDK_INT >= 33) return checkSelfPermission("android.permission.POST_NOTIFICATIONS") == PackageManager.PERMISSION_GRANTED;
            return true;
        }
        @JavascriptInterface public void requestNotify() {
            if (Build.VERSION.SDK_INT >= 33) runOnUiThread(new Runnable() { public void run() {
                requestPermissions(new String[] { "android.permission.POST_NOTIFICATIONS" }, 7);
            } });
        }
        @JavascriptInterface public void note(String title, String body, String tag) { postNote(title, body, tag); }
        // Виброотклик на самой малой силе: системный performHapticFeedback (как у
        // клавиатуры), без разрешения VIBRATE и с уважением к системной настройке.
        // tick — шаг ползунка, tap — касание, edge — упор, boot — заставка.
        @JavascriptInterface public void haptic(final String kind) {
            runOnUiThread(new Runnable() { public void run() {
                if (web == null) return;
                int c;
                if ("tick".equals(kind)) c = HapticFeedbackConstants.CLOCK_TICK;
                else if ("edge".equals(kind)) c = HapticFeedbackConstants.VIRTUAL_KEY;
                else if ("boot".equals(kind)) c = Build.VERSION.SDK_INT >= 30 ? HapticFeedbackConstants.CONFIRM : HapticFeedbackConstants.VIRTUAL_KEY;
                else c = HapticFeedbackConstants.KEYBOARD_TAP;
                web.performHapticFeedback(c);
            } });
        }
        // Долгая тихая вибрация на время полосы установки обновления. Малая
        // амплитуда, где телефон её умеет; где нет — мелкие импульсы вместо гула
        // на полной силе.
        @JavascriptInterface public void hapticLong(final int ms) {
            runOnUiThread(new Runnable() { public void run() {
                try {
                    Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
                    if (v == null || !v.hasVibrator()) return;
                    int n = Math.max(20, Math.min(30000, ms));
                    if (Build.VERSION.SDK_INT >= 26 && v.hasAmplitudeControl()) {
                        v.vibrate(VibrationEffect.createOneShot(n, 40));
                        return;
                    }
                    int k = Math.max(1, n / 140);
                    long[] t = new long[k * 2];
                    for (int i = 0; i < k; i++) { t[2 * i] = i == 0 ? 0 : 128; t[2 * i + 1] = 12; }
                    if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(t, -1));
                    else v.vibrate(t, -1);
                } catch (Exception e) { /* нет мотора или запрещено */ }
            } });
        }
        // Нарастающая вибрация запуска: амплитуда плавно идёт от 6 до peak по кривой x^2.2.
        @JavascriptInterface public void hapticRamp(final int ms, final int peak) {
            runOnUiThread(new Runnable() { public void run() {
                try {
                    Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
                    if (v == null || !v.hasVibrator()) return;
                    int n = Math.max(200, Math.min(30000, ms));
                    int top = Math.max(20, Math.min(255, peak));
                    if (Build.VERSION.SDK_INT >= 26 && v.hasAmplitudeControl()) {
                        int k = Math.max(4, n / 60);
                        long[] t = new long[k];
                        int[] a = new int[k];
                        for (int i = 0; i < k; i++) {
                            double x = (i + 1.0) / k;
                            t[i] = 60;
                            a[i] = (int) Math.max(1, Math.min(255, 6 + (top - 6) * Math.pow(x, 2.2)));
                        }
                        v.vibrate(VibrationEffect.createWaveform(t, a, -1));
                        return;
                    }
                    int k = Math.max(4, n / 90);
                    long[] t = new long[k * 2];
                    for (int i = 0; i < k; i++) {
                        double x = (i + 1.0) / k;
                        t[2 * i] = Math.round(80 - 50 * x);
                        t[2 * i + 1] = Math.round(6 + 54 * x * x);
                    }
                    if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(t, -1));
                    else v.vibrate(t, -1);
                } catch (Exception e) { /* нет мотора или запрещено */ }
            } });
        }
        @JavascriptInterface public void hapticStop() {
            runOnUiThread(new Runnable() { public void run() {
                try { Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE); if (v != null) v.cancel(); }
                catch (Exception e) { /* нечего глушить */ }
            } });
        }
    }

    private void postNote(String title, String body, String tag) {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            Notification.Builder b;
            if (Build.VERSION.SDK_INT >= 26) {
                if (nm.getNotificationChannel("wind") == null) {
                    NotificationChannel ch = new NotificationChannel("wind", "Ветер", NotificationManager.IMPORTANCE_DEFAULT);
                    ch.setDescription("Сводка ветра, прогноз и тревоги станции");
                    nm.createNotificationChannel(ch);
                }
                b = new Notification.Builder(this, "wind");
            } else {
                b = new Notification.Builder(this);
            }
            Intent open = new Intent(this, WindActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
            b.setSmallIcon(R.mipmap.ic_launcher_mono)
             .setContentTitle(title)
             .setContentText(body)
             .setStyle(new Notification.BigTextStyle().bigText(body))
             .setContentIntent(pi)
             .setAutoCancel(true)
             .setOnlyAlertOnce(true);
            nm.notify(tag == null ? "wind" : tag, 1, b.build());
        } catch (Exception e) { /* нет разрешения — молча */ }
    }

    // ---------- лента ----------
    private static byte[] http(String url, int timeoutMs) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(timeoutMs); c.setReadTimeout(timeoutMs * 2); c.setUseCaches(false);
        if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
        return readAll(c.getInputStream());
    }

    private JSONObject driveIds = null;
    private JSONObject driveFiles() {
        if (driveIds == null) {
            try { driveIds = new JSONObject(readAsset("drive-feed.json")).getJSONObject("files"); }
            catch (Exception e) { driveIds = new JSONObject(); }
        }
        return driveIds;
    }

    private String feedUrl(String base, String name) throws Exception {
        if (GDRIVE.equals(base)) {
            String id = driveFiles().optString(name, "");
            if (id.isEmpty()) throw new Exception("на Диске нет файла " + name);
            return "https://drive.usercontent.google.com/download?id=" + java.net.URLEncoder.encode(id, "UTF-8") + "&export=download&confirm=t";
        }
        return (base.endsWith("/") ? base : base + "/") + name;
    }

    // Строка обязана совпадать байт в байт с той, что подписывает desktop/feed-sign.js.
    private static boolean feedSigned(JSONObject j) {
        try {
            String sig = j.optString("sigP256", "");
            if (sig.isEmpty()) return false;
            String msg = "wk-feed-v1\n" + j.getString("version") + "\n" + j.getString("file") + "\n"
                + j.getString("sha256").toLowerCase(java.util.Locale.ROOT) + "\n" + j.getLong("size");
            PublicKey k = KeyFactory.getInstance("EC").generatePublic(
                new X509EncodedKeySpec(android.util.Base64.decode(FEED_P256, android.util.Base64.DEFAULT)));
            Signature v = Signature.getInstance("SHA256withECDSA");
            v.initVerify(k);
            v.update(msg.getBytes(StandardCharsets.UTF_8));
            return v.verify(android.util.Base64.decode(sig, android.util.Base64.DEFAULT));
        } catch (Exception e) { return false; }
    }

    private static boolean shellSigned(JSONObject e) {
        try {
            String sig = e.optString("sigP256", "");
            if (sig.isEmpty()) return false;
            String msg = "wk-shell-v1\napk\n" + e.getString("version") + "\n" + e.getString("file") + "\n"
                + e.getString("sha256").toLowerCase(java.util.Locale.ROOT) + "\n" + e.getLong("size");
            PublicKey k = KeyFactory.getInstance("EC").generatePublic(
                new X509EncodedKeySpec(android.util.Base64.decode(FEED_P256, android.util.Base64.DEFAULT)));
            Signature v = Signature.getInstance("SHA256withECDSA");
            v.initVerify(k);
            v.update(msg.getBytes(StandardCharsets.UTF_8));
            return v.verify(android.util.Base64.decode(sig, android.util.Base64.DEFAULT));
        } catch (Exception x) { return false; }
    }

    // Свежий APK на Диске. true — shell.json ответил и подпись верна.
    private boolean checkShell() {
        shellInfo = null;
        if (!driveFiles().has("shell.json")) return false;
        try {
            JSONObject e = new JSONObject(new String(http(feedUrl(GDRIVE, "shell.json"), 15000), StandardCharsets.UTF_8)).optJSONObject("apk");
            if (e == null || !shellSigned(e)) return false;
            shellLatest = e.getString("version");
            if (cmp(shellLatest, bundledVersion()) > 0) shellInfo = e;
            return true;
        } catch (Exception x) { return false; }
    }

    // Не спешим: лучше подождать ответа, чем объявить «последнюю версию», так ни
    // с кем и не поговорив. Своя сеть — 4 с, интернет — 15.
    private JSONObject fetchLatest(String base) {
        try {
            JSONObject j = new JSONObject(new String(http(feedUrl(base, "latest.json"), GDRIVE.equals(base) ? 15000 : 4000), StandardCharsets.UTF_8));
            return j.has("version") && feedSigned(j) ? j : null;
        } catch (Exception e) { return null; }
    }

    // Соседи по сети: перебор /24 каждого своего IPv4-адреса, порт раздачи открыт — это он.
    private String scanNeighbours() {
        final List<String> found = Collections.synchronizedList(new ArrayList<String>());
        try {
            List<String> prefixes = new ArrayList<String>();
            Enumeration<NetworkInterface> en = NetworkInterface.getNetworkInterfaces();
            while (en.hasMoreElements()) {
                NetworkInterface ni = en.nextElement();
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address) {
                        String h = a.getHostAddress();
                        prefixes.add(h.substring(0, h.lastIndexOf('.') + 1));
                    }
                }
            }
            ExecutorService pool = Executors.newFixedThreadPool(48);
            for (final String pre : prefixes) {
                for (int i = 1; i < 255; i++) {
                    final String host = pre + i;
                    pool.execute(new Runnable() { public void run() {
                        if (!found.isEmpty()) return;
                        try (Socket s = new Socket()) {
                            s.connect(new InetSocketAddress(host, PORT), 300);
                            found.add("http://" + host + ":" + PORT + "/feed/");
                        } catch (Exception ignored) { }
                    } });
                }
            }
            pool.shutdown();
            pool.awaitTermination(15, java.util.concurrent.TimeUnit.SECONDS);
        } catch (Exception ignored) { }
        return found.isEmpty() ? null : found.get(0);
    }

    private void doCheck() {
        if (status.equals("downloading") || status.equals("installing")) return;
        current = currentVersion();
        List<String> cands = new ArrayList<String>();
        String saved = prefs.getString("feed", "");
        if (!saved.isEmpty()) cands.add(saved);
        try { cands.add(readAsset("feed.txt").trim()); } catch (Exception ignored) { }
        if (driveFiles().has("latest.json")) cands.add(GDRIVE);
        JSONObject latest = null; String base = null;
        for (String c : cands) { if (c.isEmpty()) continue; latest = fetchLatest(c); if (latest != null) { base = c; break; } }
        if (latest == null) {
            String found = scanNeighbours();
            if (found != null) { latest = fetchLatest(found); if (latest != null) base = found; }
        }
        reached = latest != null && base != null;
        checkedAt = System.currentTimeMillis();
        if (reached) {
            // Запоминаем только свою раздачу: к ней держится поток push (listenLoop).
            if (!GDRIVE.equals(base)) prefs.edit().putString("feed", base).apply();
            via = GDRIVE.equals(base) ? "internet" : "lan";
            latestVer = latest.optString("version", "");
            feedMeta = latest;
            try {
                if (cmp(latest.getString("version"), current) > 0) {
                    feedBase = base;
                    sha = latest.optString("sha256", "");
                    JSONObject i = new JSONObject();
                    i.put("version", latest.getString("version"));
                    i.put("notes", latest.optJSONArray("notes") != null ? latest.getJSONArray("notes") : new JSONArray());
                    i.put("date", latest.optString("date", ""));
                    i.put("size", latest.optLong("size", 0));
                    i.put("file", latest.optString("file", "index.html"));
                    info = i; status = "available"; error = ""; progress = 0;
                } else { status = "idle"; info = null; }
            } catch (Exception e) { status = "idle"; info = null; }
        } else if (!status.equals("error")) { status = "idle"; info = null; }
        // Сам APK: новее своего — предлагаем его целиком, а не один интерфейс.
        boolean shellOk = checkShell();
        if (shellInfo != null) {
            try {
                String sv = shellInfo.getString("version");
                if (info == null || cmp(sv, info.getString("version")) >= 0) {
                    boolean same = feedMeta != null && cmp(feedMeta.optString("version", ""), sv) == 0;
                    JSONObject i = new JSONObject();
                    i.put("kind", "shell");
                    i.put("version", sv);
                    i.put("notes", same && feedMeta.optJSONArray("notes") != null ? feedMeta.getJSONArray("notes") : new JSONArray());
                    i.put("date", same ? feedMeta.optString("date", "") : "");
                    i.put("size", shellInfo.optLong("size", 0));
                    i.put("file", shellInfo.getString("file"));
                    info = i; status = "available"; error = ""; progress = 0;
                }
            } catch (Exception ignored) { }
        }
        reached = reached || shellOk;
        push();
    }

    private byte[] download(String url, long size) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(10000); c.setReadTimeout(30000); c.setUseCaches(false);
        if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
        long total = c.getContentLengthLong() > 0 ? c.getContentLengthLong() : size;
        InputStream in = c.getInputStream();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384]; int n; long got = 0; long last = 0;
        while ((n = in.read(buf)) > 0) {
            out.write(buf, 0, n); got += n;
            if (total > 0 && System.currentTimeMillis() - last > 60) { progress = Math.min(1.0, (double) got / total); last = System.currentTimeMillis(); push(); }
        }
        in.close();
        return out.toByteArray();
    }

    private static String sha256(byte[] data) throws Exception {
        StringBuilder hex = new StringBuilder();
        for (byte b : MessageDigest.getInstance("SHA-256").digest(data)) hex.append(String.format("%02x", b));
        return hex.toString();
    }

    // Новый APK: скачать, сверить хеш из подписанного shell.json, отдать системе.
    // Android сам проверит, что APK подписан тем же ключом, что установленный, и
    // попросит человека нажать «Установить» — без Google Play иначе нельзя.
    private void installApk() {
        try {
            JSONObject e = shellInfo;
            if (e == null) throw new Exception("описание приложения устарело — проверьте ещё раз");
            if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
                status = "error";
                error = "разрешите этому приложению устанавливать приложения, вернитесь и нажмите «Обновить» ещё раз";
                push();
                startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                return;
            }
            status = "downloading"; progress = 0; error = ""; push();
            byte[] data = download(feedUrl(GDRIVE, e.getString("file")), e.optLong("size", 0));
            // Не сошлось почти всегда потому, что Диск ещё выгружает новый APK.
            if (!sha256(data).equalsIgnoreCase(e.getString("sha256"))) throw new Exception("новая версия ещё загружается на сервер — попробуйте через пару минут");
            status = "installing"; progress = 1; push();
            PackageInstaller pi = getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams sp = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            sp.setAppPackageName(getPackageName());
            int id = pi.createSession(sp);
            PackageInstaller.Session s = pi.openSession(id);
            java.io.OutputStream o = s.openWrite("app.apk", 0, data.length);
            o.write(data); s.fsync(o); o.close();
            Intent cb = new Intent(ACTION_INSTALLED).setPackage(getPackageName());
            int fl = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            s.commit(PendingIntent.getBroadcast(this, id, cb, fl).getIntentSender());
            s.close();
        } catch (Exception x) {
            status = "error"; error = String.valueOf(x.getMessage() != null ? x.getMessage() : x);
            push();
        }
    }

    private void doInstall() {
        if ((!status.equals("available") && !status.equals("error")) || info == null) return;
        if ("shell".equals(info.optString("kind"))) { installApk(); return; }
        try {
            status = "downloading"; progress = 0; error = ""; push();
            String ver = info.getString("version");
            URL u = new URL(feedUrl(feedBase, info.getString("file")));
            HttpURLConnection c = (HttpURLConnection) u.openConnection();
            c.setConnectTimeout(10000); c.setReadTimeout(30000); c.setUseCaches(false);
            if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
            long total = c.getContentLengthLong() > 0 ? c.getContentLengthLong() : info.optLong("size", 0);
            InputStream in = c.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384]; int n; long got = 0; long last = 0;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n); got += n;
                if (total > 0 && System.currentTimeMillis() - last > 60) { progress = Math.min(1.0, (double) got / total); last = System.currentTimeMillis(); push(); }
            }
            in.close();
            byte[] data = out.toByteArray();
            if (!sha.isEmpty()) {
                StringBuilder hex = new StringBuilder();
                for (byte b : MessageDigest.getInstance("SHA-256").digest(data)) hex.append(String.format("%02x", b));
                if (!hex.toString().equalsIgnoreCase(sha)) throw new Exception("контрольная сумма не сошлась — файл повреждён");
            }
            status = "installing"; progress = 1; push();
            File dir = new File(updDir(), ver); dir.mkdirs();
            File f = new File(dir, "index.html"), part = new File(dir, "index.html.part");
            FileOutputStream fo = new FileOutputStream(part); fo.write(data); fo.close();
            if (f.exists()) f.delete();
            part.renameTo(f);
            JSONObject a = new JSONObject(); a.put("version", ver); a.put("file", f.getAbsolutePath());
            FileOutputStream fa = new FileOutputStream(new File(updDir(), "active.json"));
            fa.write(a.toString().getBytes(StandardCharsets.UTF_8)); fa.close();
            File[] old = updDir().listFiles();
            if (old != null) for (File d : old) if (d.isDirectory() && !d.getName().equals(ver)) deleteTree(d);
            Thread.sleep(900);                       // дать увидеть «Устанавливаю»
            status = "idle"; info = null; current = ver;
            runOnUiThread(new Runnable() { public void run() { loadApp(); } });
        } catch (Exception e) {
            status = "error"; error = String.valueOf(e.getMessage() != null ? e.getMessage() : e);
            push();
        }
    }



    // ---------- компас ----------
    private volatile boolean compassWanted = false;
    private SensorManager sensors;
    private SensorEventListener compass = null;
    private long lastHeadingPush = 0;

    private void compassOn() {
        if (compass != null) return;
        sensors = (SensorManager) getSystemService(SENSOR_SERVICE);
        Sensor rv = sensors.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
        if (rv == null) return;                      // датчика нет — интерфейс сам скажет «нет компаса»
        compass = new SensorEventListener() {
            private final float[] r = new float[9], r2 = new float[9], o = new float[3];
            public void onAccuracyChanged(Sensor sensor, int accuracy) { }
            public void onSensorChanged(SensorEvent e) {
                long now = System.currentTimeMillis();
                if (now - lastHeadingPush < 60) return;       // ~16 раз в секунду хватает
                lastHeadingPush = now;
                SensorManager.getRotationMatrixFromVector(r, e.values);
                // Лёжа — куда смотрит верх телефона; стоя (как держат, глядя на экран) —
                // куда смотрит задняя сторона. Граница — наклон около 45°.
                float[] m = r;
                if (Math.abs(r[8]) < 0.7f) {
                    SensorManager.remapCoordinateSystem(r, SensorManager.AXIS_X, SensorManager.AXIS_Z, r2);
                    m = r2;
                }
                SensorManager.getOrientation(m, o);
                double deg = (Math.toDegrees(o[0]) + 360.0) % 360.0;
                final String js = "window.__wkHeading&&window.__wkHeading(" + String.format(java.util.Locale.US, "%.1f", deg) + ")";
                web.evaluateJavascript(js, null);
            }
        };
        sensors.registerListener(compass, rv, SensorManager.SENSOR_DELAY_UI);
    }

    private void compassOff() {
        if (compass != null && sensors != null) sensors.unregisterListener(compass);
        compass = null;
    }

    // ---------- место ----------
    private boolean locDone = false;

    private void locResult(final double lat, final double lon, final float acc, final String err) {
        if (locDone) return;
        locDone = true;
        final String js = err != null ? "window.__wkLoc&&window.__wkLoc({error:\"" + err + "\"})"
            : "window.__wkLoc&&window.__wkLoc({lat:" + String.format(java.util.Locale.US, "%.6f", lat)
              + ",lon:" + String.format(java.util.Locale.US, "%.6f", lon) + ",acc:" + (int) acc + "})";
        web.evaluateJavascript(js, null);
    }

    private void locate() {
        locDone = false;
        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { Manifest.permission.ACCESS_FINE_LOCATION }, 1);
            locResult(0, 0, 0, "permission");
            return;
        }
        final LocationManager lm = (LocationManager) getSystemService(LOCATION_SERVICE);
        // Сначала то, что уже известно и не старше десяти минут: ответ сразу.
        Location best = null;
        try {
            for (String pr : lm.getProviders(true)) {
                Location l = lm.getLastKnownLocation(pr);
                if (l != null && System.currentTimeMillis() - l.getTime() < 10 * 60 * 1000 && (best == null || l.getAccuracy() < best.getAccuracy())) best = l;
            }
        } catch (SecurityException ignored) { }
        if (best != null) { locResult(best.getLatitude(), best.getLongitude(), best.getAccuracy(), null); return; }
        // Иначе — один свежий отсчёт от любого включённого источника.
        final LocationListener ll = new LocationListener() {
            public void onLocationChanged(Location l) { locResult(l.getLatitude(), l.getLongitude(), l.getAccuracy(), null); lm.removeUpdates(this); }
            public void onStatusChanged(String p, int s, android.os.Bundle b) { }
            public void onProviderEnabled(String p) { }
            public void onProviderDisabled(String p) { }
        };
        boolean any = false;
        try {
            for (String pr : lm.getProviders(true)) {
                if (LocationManager.PASSIVE_PROVIDER.equals(pr)) continue;
                lm.requestLocationUpdates(pr, 0, 0, ll, getMainLooper());
                any = true;
            }
        } catch (SecurityException ignored) { }
        if (!any) { locResult(0, 0, 0, "disabled"); return; }
        web.postDelayed(new Runnable() { public void run() { lm.removeUpdates(ll); locResult(0, 0, 0, "timeout"); } }, 14000);
    }

    // ---------- push: поток событий с компьютера ----------
    // Приложение держит открытым <лента>/events. Как только хук опубликовал новую
    // версию, сервер пишет туда `event: update`, и проверка запускается сразу, без
    // ожидания очередного опроса. Работает, пока приложение на экране: в
    // фоне Android всё равно усыпил бы соединение.
    private volatile boolean listening = false;
    private Thread listener = null;

    private synchronized void startListening() {
        if (listening) return;
        listening = true;
        listener = new Thread(new Runnable() { public void run() { listenLoop(); } });
        listener.setDaemon(true);
        listener.start();
    }

    private synchronized void stopListening() {
        listening = false;
        if (listener != null) listener.interrupt();
        listener = null;
    }

    private void listenLoop() {
        int fails = 0;
        while (listening) {
            String base = prefs.getString("feed", "");
            // Своей раздачи не знаем (вне дома): push держать не к чему. Проверки идут
            // от дашборда (раз в 10 минут и при возвращении в окно) — через Диск.
            if (base.isEmpty()) { sleepQuiet(60000); continue; }
            try {
                if (!base.endsWith("/")) base += "/";
                HttpURLConnection c = (HttpURLConnection) new URL(base + "events").openConnection();
                c.setConnectTimeout(3000); c.setReadTimeout(45000); c.setUseCaches(false);
                if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
                BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8));
                fails = 0;
                io.execute(new Runnable() { public void run() { doCheck(); } });   // догнать пропущенное
                String line;
                while (listening && (line = r.readLine()) != null) {
                    if (line.startsWith("event: update")) {
                        io.execute(new Runnable() { public void run() { doCheck(); } });
                    }
                }
                r.close();
            } catch (Exception e) {
                if (!listening) return;
                fails++;
                // Адрес мог смениться: после нескольких неудач ищем раздачу заново.
                if (fails == 3) { prefs.edit().remove("feed").apply(); }
            }
            sleepQuiet(Math.min(30000, 2000 * (fails + 1)));
        }
    }

    private static void sleepQuiet(long ms) { try { Thread.sleep(ms); } catch (InterruptedException ignored) { } }

    private static void deleteTree(File f) {
        File[] k = f.listFiles();
        if (k != null) for (File c : k) deleteTree(c);
        f.delete();
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    @Override protected void onPause() { super.onPause(); web.onPause(); stopListening(); compassOff(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); startListening(); if (compassWanted) compassOn(); }
}
