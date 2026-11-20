package org.windstation.weatheredkiwi;

// Настоящее окно приложения (с 0.5.0). Весь код — в MainActivity; этот класс нужен
// только ради имени: прежнее имя «.MainActivity» стало ярлыком (activity-alias) со
// стеклянным значком, рядом — «.TonalLauncher» с тональным, и тумблер «Liquid Glass
// иконка» включает один из них (MainActivity.setIcon). Ярлык оставлен под старым
// именем, чтобы после обновления значок на рабочем столе не пропадал.
// Явные Intent'ы (уведомление, нажатие на виджет) идут сюда, а не в ярлык:
// выключенный ярлык они бы не открыли.
public class WindActivity extends MainActivity {
}
