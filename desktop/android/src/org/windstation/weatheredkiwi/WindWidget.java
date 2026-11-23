package org.windstation.weatheredkiwi;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.BlurMaskFilter;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.SweepGradient;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

// Виджеты рабочего стола. RemoteViews не умеют ни размытия, ни свечения, ни
// градиентной дуги, поэтому весь виджет рисуется Canvas'ом в картинку ровно
// под свой размер — и перерисовывается при каждом растягивании
// (onAppWidgetOptionsChanged). Отсюда и «тянется»: раскладка выбирается по
// пропорциям, а не масштабируется одна и та же.
//
// Материал — тот же Liquid Glass, что у дашборда: тёмная сцена с пятнами
// живого фона (палитра mountWall из wind-themes.js), иней, верхний блик, фаска
// по краю. Сцена полупрозрачная: настоящего размытия обоев у виджета нет и быть
// не может, но обои сквозь стекло всё равно проступают.
//
// Данные: пока приложение открыто, дашборд сам отдаёт последнее показание
// (WKNative.widget, раз в несколько секунд). Без приложения виджет ходит на
// плату сам — /api/data по тому же адресу, — но только если связь прямая:
// через облако HTTP до платы нет, и стучаться было бы некуда. Кнопка ↻ в углу —
// то же самое по требованию.
public class WindWidget extends AppWidgetProvider {
    static final String ACT_REFRESH = "org.windstation.weatheredkiwi.WIDGET_REFRESH";
    private static final String PREFS = "wkw";
    private static final int HIST_MAX = 72;               // 3 часа при сэмпле раз в 150 с
    private static final long HIST_STEP_MS = 150000;
    private static final long STALE_MS = 90000;

    // Второй виджет в списке — широкий по умолчанию. Рисует тот же код: размер
    // по умолчанию — единственное, чем они различаются.
    public static class Wide extends WindWidget { }

    // ---------- приём данных ----------

    // Из дашборда: {d: <кадр /api/data>, c: connected, src, unit, host, link}.
    static void store(Context ctx, String json) {
        try {
            JSONObject j = new JSONObject(json);
            SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            SharedPreferences.Editor e = p.edit();
            long now = System.currentTimeMillis();
            boolean c = j.optBoolean("c", false);
            e.putString("unit", j.optString("unit", "ms"));
            e.putString("src", j.optString("src", "station"));
            e.putString("host", j.optString("host", ""));
            e.putString("link", j.optString("link", "direct"));
            JSONObject d = j.optJSONObject("d");
            if (c && d != null) {
                e.putString("d", d.toString());
                e.putLong("t", now);
                addHist(p, e, d.optDouble("speed", 0), now);
            }
            e.putBoolean("c", c);
            e.apply();
            long last = p.getLong("drawn", 0);
            if (now - last >= 4000) {              // не чаще раза в 4 с: картинка не бесплатна
                p.edit().putLong("drawn", now).apply();
                updateAll(ctx);
            }
        } catch (Exception ignored) { }
    }

    private static void addHist(SharedPreferences p, SharedPreferences.Editor e, double v, long now) {
        if (now - p.getLong("ht", 0) < HIST_STEP_MS) return;
        String h = p.getString("hist", "");
        String[] parts = h.isEmpty() ? new String[0] : h.split(",");
        StringBuilder b = new StringBuilder();
        int from = Math.max(0, parts.length - (HIST_MAX - 1));
        for (int i = from; i < parts.length; i++) b.append(parts[i]).append(',');
        b.append(String.format(Locale.ROOT, "%.2f", v));
        e.putString("hist", b.toString());
        e.putLong("ht", now);
    }

    // Без приложения — сами на плату, если до неё есть прямой HTTP.
    private static boolean fetch(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String host = p.getString("host", "");
        if (host.isEmpty() || !"station".equals(p.getString("src", "station"))
                || !"direct".equals(p.getString("link", "direct"))) return false;
        try {
            HttpURLConnection c = (HttpURLConnection) new URL("http://" + host + "/api/data").openConnection();
            c.setConnectTimeout(3000); c.setReadTimeout(3000); c.setUseCaches(false);
            if (c.getResponseCode() != 200) return false;
            InputStream in = c.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[4096]; int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            in.close();
            JSONObject d = new JSONObject(new String(out.toByteArray(), StandardCharsets.UTF_8));
            long now = System.currentTimeMillis();
            SharedPreferences.Editor e = p.edit();
            e.putString("d", d.toString()).putLong("t", now).putBoolean("c", true);
            addHist(p, e, d.optDouble("speed", 0), now);
            e.apply();
            return true;
        } catch (Exception ex) { return false; }
    }

    private void refreshAsync(final Context ctx) {
        final PendingResult pr = goAsync();
        new Thread(new Runnable() { public void run() {
            try {
                fetch(ctx);
                ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong("spin", 0).apply();
                updateAll(ctx);
            } finally { pr.finish(); }
        } }).start();
    }

    // ---------- жизненный цикл ----------

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) draw(ctx, mgr, id);
        refreshAsync(ctx);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle o) {
        draw(ctx, mgr, id);
    }

    @Override
    public void onReceive(Context ctx, Intent i) {
        if (ACT_REFRESH.equals(i.getAction())) {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong("spin", System.currentTimeMillis()).apply();
            updateAll(ctx);
            refreshAsync(ctx);
            return;
        }
        super.onReceive(ctx, i);
    }

    static void updateAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        for (Class<?> k : new Class<?>[] { WindWidget.class, Wide.class }) {
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, k));
            if (ids != null) for (int id : ids) draw(ctx, mgr, id);
        }
    }

    private static void draw(Context ctx, AppWidgetManager mgr, int id) {
        try {
            Bundle o = mgr.getAppWidgetOptions(id);
            boolean land = ctx.getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
            int w = o.getInt(land ? AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH : AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
            int h = o.getInt(land ? AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT : AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
            if (w <= 0) w = 180;
            if (h <= 0) h = 180;
            RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.wk_widget);
            rv.setImageViewBitmap(R.id.img, render(ctx, w, h, Model.load(ctx)));
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
            Intent open = new Intent(ctx, WindActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            rv.setOnClickPendingIntent(R.id.img, PendingIntent.getActivity(ctx, 0, open, flags));
            Intent ref = new Intent(ctx, WindWidget.class).setAction(ACT_REFRESH);
            rv.setOnClickPendingIntent(R.id.refresh, PendingIntent.getBroadcast(ctx, 1, ref, flags));
            mgr.updateAppWidget(id, rv);
        } catch (Exception ignored) { }
    }

    // ---------- модель ----------

    static final class Model {
        boolean has, live, dirPresent, batPresent, charging;
        double speed, gust, max = 30, dir;
        int bat = -1;
        long age = -1;
        String unit = "ms", src = "station";
        float[] hist = new float[0];
        boolean spinning;

        static Model load(Context ctx) {
            SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            Model m = new Model();
            m.unit = p.getString("unit", "ms");
            m.src = p.getString("src", "station");
            long now = System.currentTimeMillis();
            m.spinning = now - p.getLong("spin", 0) < 3500;
            String ds = p.getString("d", "");
            if (!ds.isEmpty()) {
                try {
                    JSONObject d = new JSONObject(ds);
                    m.has = true;
                    m.speed = d.optDouble("speed", 0);
                    m.gust = d.optDouble("gust", 0);
                    m.max = Math.max(5, d.optDouble("speedMax", 30));
                    m.dirPresent = d.optBoolean("dirPresent", false) && !d.isNull("direction");
                    m.dir = d.optDouble("direction", 0);
                    m.batPresent = d.optBoolean("batteryPresent", false) && !d.isNull("batteryPercent");
                    m.bat = (int) Math.round(d.optDouble("batteryPercent", -1));
                    String cs = d.optString("chargeState", "");
                    m.charging = "charging".equals(cs) || "full".equals(cs);
                } catch (Exception ignored) { }
                m.age = now - p.getLong("t", now);
                m.live = p.getBoolean("c", false) && m.age < STALE_MS;
            }
            String h = p.getString("hist", "");
            if (!h.isEmpty()) {
                String[] s = h.split(",");
                m.hist = new float[s.length];
                for (int i = 0; i < s.length; i++) try { m.hist[i] = Float.parseFloat(s[i]); } catch (Exception e) { m.hist[i] = 0; }
            }
            return m;
        }
    }

    // ---------- единицы и слова ----------

    private static final double[] BFT = { 0.5, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7 };
    private static final String[] BFT_NAME = { "Штиль", "Тихий", "Лёгкий", "Слабый", "Умеренный", "Свежий",
        "Сильный", "Крепкий", "Очень крепкий", "Шторм", "Сильный шторм", "Жестокий шторм", "Ураган" };
    private static final String[] DIRS = { "С", "СВ", "В", "ЮВ", "Ю", "ЮЗ", "З", "СЗ" };

    static int beaufort(double ms) { int b = 0; while (b < BFT.length && ms >= BFT[b]) b++; return b; }

    static String unitLabel(String u) {
        switch (u) { case "kmh": return "км/ч"; case "mph": return "mph"; case "kt": return "kt";
            case "fts": return "ft/s"; case "bft": return "бфт"; default: return "м/с"; }
    }

    static String fmt(double ms, String u) {
        switch (u) {
            case "kmh": return String.valueOf(Math.round(ms * 3.6));
            case "mph": return String.valueOf(Math.round(ms * 2.236936));
            case "kt": return String.valueOf(Math.round(ms * 1.943844));
            case "fts": return String.valueOf(Math.round(ms * 3.28084));
            case "bft": return String.valueOf(beaufort(ms));
            default: return String.format(Locale.ROOT, "%.1f", ms);
        }
    }

    // Цвет ветра: те же пороги, что у светодиодов станции — жёлтый от 5 м/с, красный от 15.
    static int accent(double ms) {
        if (ms < 2) return 0xff5ee0ff;
        if (ms < 5) return 0xff7cf0b4;
        if (ms < 15) return 0xffffd166;
        return 0xffff5c7a;
    }

    static String ageText(Model m) {
        if (!m.has) return "нет данных";
        if (m.live && m.age < 15000) return "сейчас";
        long s = m.age / 1000;
        if (s < 60) return s + " с назад";
        if (s < 3600) return (s / 60) + " мин назад";
        if (s < 86400) return (s / 3600) + " ч назад";
        return (s / 86400) + " дн назад";
    }

    static String srcText(String s) {
        switch (s) { case "demo": return "ДЕМО"; case "district": return "РАЙОН"; default: return "СТАНЦИЯ"; }
    }

    // ---------- рисование ----------

    private static final Typeface LIGHT = Typeface.create("sans-serif-light", Typeface.NORMAL);
    private static final Typeface MED = Typeface.create("sans-serif-medium", Typeface.NORMAL);
    private static final Typeface REG = Typeface.create("sans-serif", Typeface.NORMAL);
    private static final Typeface MONO = Typeface.MONOSPACE;

    static Bitmap render(Context ctx, int wDp, int hDp, Model m) {
        float dens = ctx.getResources().getDisplayMetrics().density;
        // Потолок по точкам: у RemoteViews ограничен объём картинок, а виджет во
        // весь экран на плотности 3.5 — это 10 МБ на кадр.
        float k = Math.min(dens, (float) Math.sqrt(1400000.0 / Math.max(1, wDp * hDp)));
        int W = Math.max(1, Math.round(wDp * k)), H = Math.max(1, Math.round(hDp * k));
        Bitmap bmp = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        c.scale(k, k);
        new Painter(c, wDp, hDp, m).paint();
        return bmp;
    }

    // Всё в dp: холст отмасштабирован заранее.
    static final class Painter {
        final Canvas c; final float W, H; final Model m;
        final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        final int acc;
        RectF card;
        float rad;
        float spacing = 0;           // разрядка для следующего text(), только на один вызов

        Painter(Canvas c, float W, float H, Model m) {
            this.c = c; this.W = W; this.H = H; this.m = m;
            acc = m.has ? accent(m.speed) : 0xff8aa0c0;
        }

        void reset() { p.reset(); p.setFlags(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG); }

        void paint() {
            float pad = 5;
            card = new RectF(pad, pad, W - pad, H - pad);
            rad = Math.min(28, Math.min(card.width(), card.height()) * 0.24f);
            glass();
            float cw = card.width(), ch = card.height();
            if (cw >= 1.55f * ch && cw >= 230) wide();
            else if (ch >= 1.45f * cw && ch >= 230) tall();
            else if (cw >= 240 && ch >= 240) large();
            else compact();
            refreshGlyph();
        }

        // --- стекло ---
        void glass() {
            // тень под плиткой
            reset();
            p.setColor(0x8c000000);
            p.setMaskFilter(new BlurMaskFilter(6, BlurMaskFilter.Blur.NORMAL));
            c.drawRoundRect(new RectF(card.left + 1, card.top + 2.5f, card.right - 1, card.bottom + 2.5f), rad, rad, p);

            Path clip = new Path();
            clip.addRoundRect(card, rad, rad, Path.Direction.CW);
            c.save();
            c.clipPath(clip);
            // основа: та же тёмная сцена, полупрозрачная — обои проступают
            reset();
            p.setShader(new LinearGradient(card.left, card.top, card.right, card.bottom,
                new int[] { 0xd90d1430, 0xdf070a1c, 0xe804060f }, new float[] { 0, .55f, 1 }, Shader.TileMode.CLAMP));
            c.drawRect(card, p);
            float big = Math.max(card.width(), card.height());
            blob(card.left + card.width() * .06f, card.top + card.height() * .02f, big * .62f, 0x9e3068ff);
            blob(card.right, card.top + card.height() * .16f, big * .5f, 0x8c9646eb);
            blob(card.left + card.width() * .14f, card.bottom, big * .48f, 0x6b14beb4);
            // четвёртое пятно — цвет самого ветра: виджет «дышит» вместе с показанием
            blob(card.right, card.bottom, big * .46f, (acc & 0x00ffffff) | 0x5c000000);
            // иней
            reset();
            p.setShader(new LinearGradient(0, card.top, 0, card.bottom,
                new int[] { 0x17ffffff, 0x03ffffff, 0x0bffffff }, new float[] { 0, .5f, 1 }, Shader.TileMode.CLAMP));
            c.drawRect(card, p);
            // верхний блик — изогнутый, как у стекла iOS 26
            Path g = new Path();
            float gh = Math.min(card.height() * .42f, 90);
            g.moveTo(card.left, card.top);
            g.lineTo(card.right, card.top);
            g.lineTo(card.right, card.top + gh * .62f);
            g.cubicTo(card.right - card.width() * .3f, card.top + gh * .9f, card.left + card.width() * .3f, card.top + gh * .82f, card.left, card.top + gh);
            g.close();
            reset();
            p.setShader(new LinearGradient(0, card.top, 0, card.top + gh, 0x30ffffff, 0x00ffffff, Shader.TileMode.CLAMP));
            c.drawPath(g, p);
            c.restore();

            // фаска: светлая кромка сверху-слева и снизу-справа, тёмная внутренняя
            reset();
            p.setStyle(Paint.Style.STROKE);
            p.setStrokeWidth(1.1f);
            p.setShader(new LinearGradient(card.left, card.top, card.right, card.bottom,
                new int[] { 0xb4ffffff, 0x1cffffff, 0x0dffffff, 0x5cffffff }, new float[] { 0, .35f, .7f, 1 }, Shader.TileMode.CLAMP));
            RectF r1 = inset(card, .55f);
            c.drawRoundRect(r1, rad - .55f, rad - .55f, p);
            reset();
            p.setStyle(Paint.Style.STROKE);
            p.setStrokeWidth(.8f);
            p.setColor(0x47000000);
            RectF r2 = inset(card, 1.6f);
            c.drawRoundRect(r2, rad - 1.6f, rad - 1.6f, p);
        }

        void blob(float x, float y, float r, int col) {
            reset();
            int clear = col & 0x00ffffff;
            int mid = (Math.round((col >>> 24) * .42f) << 24) | clear;
            p.setShader(new RadialGradient(x, y, r, new int[] { col, mid, clear }, new float[] { 0, .55f, 1 }, Shader.TileMode.CLAMP));
            c.drawCircle(x, y, r, p);
        }

        static RectF inset(RectF r, float d) { return new RectF(r.left + d, r.top + d, r.right - d, r.bottom - d); }

        // --- раскладки ---

        void compact() {
            float cw = card.width(), ch = card.height();
            boolean head = ch >= 125 && cw >= 110;
            float top = card.top + (head ? 30 : 8), bottom = card.bottom - (ch >= 150 ? 26 : 8);
            if (head) header(false);
            float r = Math.min(cw * .5f - 14, (bottom - top) * .5f);
            r = Math.max(r, 16);
            float cx = card.centerX(), cy = (top + bottom) / 2 + r * .06f;
            ring(cx, cy, r, true);
            if (ch >= 150) {
                String s = m.has ? "порыв " + fmt(m.gust, m.unit) + " · " + ageText(m) : "откройте приложение";
                text(s, cx, card.bottom - 12, 10.5f, 0x99ffffff, REG, Paint.Align.CENTER, cw - 24);
            }
        }

        void wide() {
            float cw = card.width(), ch = card.height();
            header(true);
            float top = card.top + 30, bottom = card.bottom - 12;
            float r = Math.min((bottom - top) * .5f, cw * .2f);
            float cx = card.left + 16 + r, cy = (top + bottom) / 2 + 2;
            ring(cx, cy, r, true);
            float x0 = cx + r + 22, x1 = card.right - 18;
            float colW = x1 - x0;
            float y = top + 6;
            float title = Math.min(22, Math.max(14, ch * .12f));
            text(m.has ? BFT_NAME[beaufort(m.speed)] : "Нет данных", x0, y + title * .8f, title, 0xfff4f8ff, MED, Paint.Align.LEFT, colW);
            y += title + 8;
            float rowH = Math.min(22, Math.max(15, ch * .11f));
            float avail = bottom - y;
            boolean spark = avail >= rowH * 2 + 34 && m.hist.length >= 2;
            float rowsArea = spark ? avail - 34 : avail;
            int rows = 0;
            String[][] list = rowsList();
            for (String[] row : list) {
                if ((rows + 1) * rowH > rowsArea) break;
                kv(row[0], row[1], x0, x1, y + rowH * rows + rowH * .72f, rowH * .66f);
                rows++;
            }
            if (spark) sparkline(new RectF(x0, bottom - 30, x1, bottom - 2));
        }

        void tall() {
            float cw = card.width(), ch = card.height();
            header(true);
            float top = card.top + 32;
            float r = Math.min(cw * .5f - 18, ch * .24f);
            float cx = card.centerX(), cy = top + r + 6;
            ring(cx, cy, r, true);
            float y = cy + r + 22;
            float title = Math.min(20, cw * .1f);
            text(m.has ? BFT_NAME[beaufort(m.speed)] : "Нет данных", cx, y, title, 0xfff4f8ff, MED, Paint.Align.CENTER, cw - 24);
            y += 14;
            float x0 = card.left + 18, x1 = card.right - 18;
            float rowH = Math.min(24, Math.max(16, cw * .1f));
            float bottom = card.bottom - 14;
            boolean spark = m.hist.length >= 2 && bottom - y > rowH * 2 + 40;
            float lim = spark ? bottom - 44 : bottom;
            int i = 0;
            for (String[] row : rowsList()) {
                float ry = y + rowH * i + rowH * .72f;
                if (ry > lim) break;
                kv(row[0], row[1], x0, x1, ry, rowH * .62f);
                i++;
            }
            if (spark) sparkline(new RectF(x0, bottom - 38, x1, bottom));
        }

        void large() {
            float cw = card.width(), ch = card.height();
            header(true);
            float chipH = Math.min(58, ch * .2f);
            float top = card.top + 32, bottom = card.bottom - chipH - 18;
            // кривая порывов — фоном под кольцом, во всю ширину
            if (m.hist.length >= 2) sparklineBg(new RectF(card.left, bottom - (bottom - top) * .45f, card.right, bottom + 4));
            float r = Math.min(cw * .5f - 30, (bottom - top) * .5f - 4);
            float cx = card.centerX(), cy = (top + bottom) / 2 + 4;
            ring(cx, cy, r, true);
            String[][] chips = chipsList();
            int n = chips.length;
            float gap = 8, x = card.left + 12, cwChip = (cw - 24 - gap * (n - 1)) / n;
            for (String[] chip : chips) {
                chip(new RectF(x, card.bottom - 12 - chipH, x + cwChip, card.bottom - 12), chip[0], chip[1]);
                x += cwChip + gap;
            }
        }

        String[][] rowsList() {
            java.util.ArrayList<String[]> l = new java.util.ArrayList<>();
            if (m.has) {
                l.add(new String[] { "Порыв", fmt(m.gust, m.unit) + " " + unitLabel(m.unit) });
                if (m.dirPresent) l.add(new String[] { "Направление", dirText(m.dir) });
                if (m.batPresent && m.bat >= 0) l.add(new String[] { "Батарея", (m.charging ? "⚡ " : "") + m.bat + " %" });
                l.add(new String[] { "Обновлено", ageText(m) });
            } else {
                l.add(new String[] { "Станция", "не на связи" });
                l.add(new String[] { "Совет", "откройте приложение" });
            }
            return l.toArray(new String[0][]);
        }

        String[][] chipsList() {
            java.util.ArrayList<String[]> l = new java.util.ArrayList<>();
            l.add(new String[] { "ПОРЫВ", m.has ? fmt(m.gust, m.unit) : "—" });
            if (m.dirPresent) l.add(new String[] { "КУРС", dirText(m.dir) });
            else l.add(new String[] { "БОФОРТ", m.has ? String.valueOf(beaufort(m.speed)) : "—" });
            if (m.batPresent && m.bat >= 0) l.add(new String[] { "БАТАРЕЯ", (m.charging ? "⚡" : "") + m.bat + "%" });
            else l.add(new String[] { "ОБНОВЛЕНО", m.has ? shortAge() : "—" });
            return l.toArray(new String[0][]);
        }

        String shortAge() {
            if (m.live && m.age < 15000) return "сейчас";
            long s = m.age / 1000;
            return s < 60 ? s + "с" : s < 3600 ? (s / 60) + "м" : s < 86400 ? (s / 3600) + "ч" : (s / 86400) + "д";
        }

        static String dirText(double d) {
            int i = (int) Math.round(((d % 360) + 360) % 360 / 45.0) % 8;
            return DIRS[i] + " " + Math.round(((d % 360) + 360) % 360) + "°";
        }

        // --- детали ---

        void header(boolean withSrc) {
            float y = card.top + 21;
            // точка состояния: светится, когда кадр свежий
            int dot = m.live ? 0xff7cf0b4 : (m.has ? 0xffffb454 : 0xff8090a8);
            float dx = card.left + 17;
            if (m.live) {
                reset(); p.setColor(dot & 0x80ffffff);
                p.setMaskFilter(new BlurMaskFilter(4, BlurMaskFilter.Blur.NORMAL));
                c.drawCircle(dx, y - 3.6f, 5, p);
            }
            reset(); p.setColor(dot); c.drawCircle(dx, y - 3.6f, 3, p);
            String label = withSrc ? "ВЕТЕР · " + srcText(m.src) : "ВЕТЕР";
            reset();
            p.setTypeface(MED); p.setTextSize(10.5f); p.setLetterSpacing(.14f); p.setColor(0x9effffff);
            float maxW = card.width() - 70;
            String s = label;
            if (p.measureText(s) > maxW) s = "ВЕТЕР";
            c.drawText(s, dx + 9, y, p);
        }

        void refreshGlyph() {
            float cx = card.right - 19, cy = card.top + 17.5f, r = 5.2f;
            reset();
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1.5f); p.setStrokeCap(Paint.Cap.ROUND);
            p.setColor(m.spinning ? 0xffffffff : 0x8cffffff);
            float rot = m.spinning ? 160 : 0;
            RectF o = new RectF(cx - r, cy - r, cx + r, cy + r);
            c.save(); c.rotate(rot, cx, cy);
            c.drawArc(o, -60, 290, false, p);
            // наконечник
            double a = Math.toRadians(-60);
            float ex = cx + (float) (r * Math.cos(a)), ey = cy + (float) (r * Math.sin(a));
            Path h = new Path();
            h.moveTo(ex - 3.2f, ey - 1.4f); h.lineTo(ex + .4f, ey + .2f); h.lineTo(ex - .6f, ey + 3.6f);
            c.drawPath(h, p);
            c.restore();
        }

        void ring(float cx, float cy, float r, boolean label) {
            float sw = Math.max(4, r * .15f);
            RectF o = new RectF(cx - r, cy - r, cx + r, cy + r);
            // стеклянная «лунка» под шкалой
            reset();
            p.setShader(new RadialGradient(cx, cy - r * .3f, r * 1.1f, new int[] { 0x14ffffff, 0x05ffffff, 0x00ffffff }, null, Shader.TileMode.CLAMP));
            c.drawCircle(cx, cy, r - sw * .9f, p);
            // дорожка
            reset();
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(sw); p.setStrokeCap(Paint.Cap.ROUND);
            p.setColor(0x1affffff);
            c.drawArc(o, 135, 270, false, p);
            // риски
            reset(); p.setStrokeWidth(Math.max(.8f, sw * .12f)); p.setColor(0x2effffff);
            for (int i = 0; i <= 10; i++) {
                double a = Math.toRadians(135 + 27 * i);
                float r0 = r - sw * 1.25f, r1 = r - sw * (i % 5 == 0 ? 1.95f : 1.6f);
                c.drawLine(cx + (float) (r0 * Math.cos(a)), cy + (float) (r0 * Math.sin(a)),
                           cx + (float) (r1 * Math.cos(a)), cy + (float) (r1 * Math.sin(a)), p);
            }
            float frac = m.has ? (float) Math.max(0, Math.min(1, m.speed / m.max)) : 0;
            float sweep = Math.max(.5f, 270 * frac);
            int[] cols = { 0xff5ee0ff, 0xff7cf0b4, 0xffffd166, 0xffff8a5c, 0xffff5c7a, 0xffff5c7a, 0xff5ee0ff };
            float[] pos = { 0, .14f, .3f, .5f, .7f, .9f, 1 };
            SweepGradient sg = new SweepGradient(cx, cy, cols, pos);
            Matrix mx = new Matrix(); mx.setRotate(135, cx, cy); sg.setLocalMatrix(mx);
            int alpha = m.live ? 255 : 130;
            if (m.has) {
                // свечение дуги
                reset();
                p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(sw * 1.3f); p.setStrokeCap(Paint.Cap.ROUND);
                p.setShader(sg); p.setAlpha(m.live ? 150 : 60);
                p.setMaskFilter(new BlurMaskFilter(sw * .9f, BlurMaskFilter.Blur.NORMAL));
                c.drawArc(o, 135, sweep, false, p);
                // сама дуга
                reset();
                p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(sw); p.setStrokeCap(Paint.Cap.ROUND);
                p.setShader(sg); p.setAlpha(alpha);
                c.drawArc(o, 135, sweep, false, p);
                // стеклянный блик по верхней кромке дуги
                reset();
                p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(sw * .22f); p.setStrokeCap(Paint.Cap.ROUND);
                p.setColor(0x55ffffff);
                RectF oi = inset(o, -sw * .28f);
                c.drawArc(oi, 135, sweep, false, p);
                // порыв — риска поверх дорожки
                float gf = (float) Math.max(0, Math.min(1, m.gust / m.max));
                if (m.gust > m.speed + .05) {
                    double a = Math.toRadians(135 + 270 * gf);
                    reset(); p.setStrokeWidth(Math.max(1.2f, sw * .2f)); p.setStrokeCap(Paint.Cap.ROUND); p.setColor(0xd9ffffff);
                    float r0 = r - sw * .62f, r1 = r + sw * .62f;
                    c.drawLine(cx + (float) (r0 * Math.cos(a)), cy + (float) (r0 * Math.sin(a)),
                               cx + (float) (r1 * Math.cos(a)), cy + (float) (r1 * Math.sin(a)), p);
                }
                // бегунок
                double a = Math.toRadians(135 + sweep);
                float kx = cx + (float) (r * Math.cos(a)), ky = cy + (float) (r * Math.sin(a));
                reset(); p.setColor((acc & 0x00ffffff) | 0xaa000000);
                p.setMaskFilter(new BlurMaskFilter(sw * .8f, BlurMaskFilter.Blur.NORMAL));
                c.drawCircle(kx, ky, sw * .75f, p);
                reset(); p.setColor(0xffffffff); c.drawCircle(kx, ky, sw * .38f, p);
            }
            // стрелка направления по ободу — если датчик направления есть
            if (m.has && m.dirPresent && r >= 34) {
                double a = Math.toRadians(m.dir - 90);
                float rr = r - sw * 2.4f;
                float tx = cx + (float) (rr * Math.cos(a)), ty = cy + (float) (rr * Math.sin(a));
                c.save(); c.rotate((float) m.dir, tx, ty);
                Path t = new Path(); float s = sw * .55f;
                t.moveTo(tx, ty - s); t.lineTo(tx + s * .75f, ty + s * .7f); t.lineTo(tx - s * .75f, ty + s * .7f); t.close();
                reset(); p.setColor(0xccffffff); c.drawPath(t, p);
                c.restore();
            }
            // число
            String v = m.has ? fmt(m.speed, m.unit) : "—";
            float ts = r * .66f;
            reset(); p.setTypeface(LIGHT); p.setTextSize(ts);
            float maxW = (r - sw) * 1.7f;
            if (p.measureText(v) > maxW) ts *= maxW / p.measureText(v);
            float base = cy + ts * .32f;
            // мягкое свечение цифры цветом ветра
            if (m.live) {
                reset(); p.setTypeface(LIGHT); p.setTextSize(ts); p.setTextAlign(Paint.Align.CENTER);
                p.setColor((acc & 0x00ffffff) | 0x66000000);
                p.setMaskFilter(new BlurMaskFilter(Math.max(2, ts * .12f), BlurMaskFilter.Blur.NORMAL));
                c.drawText(v, cx, base, p);
            }
            text(v, cx, base, ts, m.live ? 0xfff6f9ff : 0xb3f6f9ff, LIGHT, Paint.Align.CENTER, 0);
            if (label && r >= 26) text(unitLabel(m.unit), cx, base + Math.max(10, r * .28f), Math.max(8.5f, r * .19f), 0x8cffffff, REG, Paint.Align.CENTER, 0);
            if (label && r >= 40 && m.has && !m.live)
                text("нет связи", cx, cy + r * .82f, Math.max(8, r * .14f), 0xccffb454, MED, Paint.Align.CENTER, 0);
        }

        void kv(String k, String v, float x0, float x1, float y, float size) {
            text(k, x0, y, size, 0x80ffffff, REG, Paint.Align.LEFT, (x1 - x0) * .5f);
            text(v, x1, y, size * 1.08f, 0xf2f4f8ff, MONO, Paint.Align.RIGHT, (x1 - x0) * .55f);
        }

        void chip(RectF r, String k, String v) {
            float rr = Math.min(16, r.height() * .34f);
            reset(); p.setColor(0x14ffffff); c.drawRoundRect(r, rr, rr, p);
            reset(); p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(.8f);
            p.setShader(new LinearGradient(0, r.top, 0, r.bottom, 0x40ffffff, 0x0affffff, Shader.TileMode.CLAMP));
            c.drawRoundRect(inset(r, .4f), rr, rr, p);
            float ks = Math.min(9.5f, r.height() * .2f);
            spacing = .1f;
            text(k, r.centerX(), r.top + r.height() * .38f, ks, 0x80ffffff, MED, Paint.Align.CENTER, r.width() - 10);
            text(v, r.centerX(), r.top + r.height() * .78f, Math.min(17, r.height() * .34f), 0xf2f4f8ff, MONO, Paint.Align.CENTER, r.width() - 10);
        }

        Path curve(RectF r, boolean close) {
            float[] h = m.hist;
            float mx = 1;
            for (float v : h) mx = Math.max(mx, v);
            mx *= 1.15f;
            Path path = new Path();
            int n = h.length;
            float px = 0, py = 0;
            for (int i = 0; i < n; i++) {
                float x = r.left + r.width() * i / (n - 1);
                float y = r.bottom - r.height() * (h[i] / mx);
                if (i == 0) path.moveTo(x, y);
                else path.quadTo(px, py, (px + x) / 2, (py + y) / 2);
                px = x; py = y;
            }
            path.lineTo(px, py);
            if (close) { path.lineTo(r.right, r.bottom); path.lineTo(r.left, r.bottom); path.close(); }
            return path;
        }

        void sparkline(RectF r) {
            reset();
            p.setShader(new LinearGradient(0, r.top, 0, r.bottom, (acc & 0x00ffffff) | 0x4d000000, acc & 0x00ffffff, Shader.TileMode.CLAMP));
            c.drawPath(curve(r, true), p);
            reset();
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1.8f); p.setStrokeJoin(Paint.Join.ROUND); p.setStrokeCap(Paint.Cap.ROUND);
            p.setColor((acc & 0x00ffffff) | 0xe6000000);
            c.drawPath(curve(r, false), p);
        }

        void sparklineBg(RectF r) {
            c.save();
            Path clip = new Path(); clip.addRoundRect(card, rad, rad, Path.Direction.CW); c.clipPath(clip);
            reset();
            p.setShader(new LinearGradient(0, r.top, 0, r.bottom, (acc & 0x00ffffff) | 0x30000000, acc & 0x00ffffff, Shader.TileMode.CLAMP));
            c.drawPath(curve(r, true), p);
            reset();
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1.4f); p.setColor((acc & 0x00ffffff) | 0x70000000);
            c.drawPath(curve(r, false), p);
            c.restore();
        }

        void text(String s, float x, float y, float size, int color, Typeface tf, Paint.Align al, float maxW) {
            float ls = spacing; spacing = 0;
            reset();
            p.setTypeface(tf); p.setTextSize(size); p.setColor(color); p.setTextAlign(al); p.setLetterSpacing(ls);
            if (maxW > 0 && p.measureText(s) > maxW) {
                float k = maxW / p.measureText(s);
                if (k > .72f) p.setTextSize(size * k);
                else {
                    p.setTextSize(size * .72f);
                    while (s.length() > 1 && p.measureText(s + "…") > maxW) s = s.substring(0, s.length() - 1);
                    s = s + "…";
                }
            }
            c.drawText(s, x, y, p);
        }
    }
}
