import type { EquipSlot } from '../core/Save';

/**
 * Toko Mainan: every item, price and shopkeeper line in ONE place. Prices are in the shared coin total (city coins: 223 one-time
 * coins and about 70 from missions, plus quiz coins), so the first items are cheap and the Merah Putih costume is a long-term goal.
 */
export type ShopTab = 'superglen' | 'glen' | 'bike' | 'ride';

export interface ShopItem {
  /** Save id (`save.data.inventory.owned`). */
  id: string;
  tab: ShopTab;
  /** Indonesian name shown on the card. */
  name: string;
  /** Coins; 0 = free default. */
  price: number;
  /** Slot this item goes in when worn. */
  slot: EquipSlot;
  /** Value given to `equip(slot, value)`: the item id, except for the ride slot ('bike' / 'skateboard'). */
  value: string;
  /** Swatch colours of the preview (one = flat, several = bands / gradient). */
  colors: string[];
  /** Preview style. */
  art: 'costume' | 'shirt' | 'bike' | 'racer' | 'skateboard';
  /** Bike paint (hex) for bike items; 'sparkle' = pink with sparkles; undefined = each bike keeps its own colour. */
  paint?: number | 'sparkle';
}

export const SHOP_TABS: readonly { id: ShopTab; label: string }[] = [
  { id: 'superglen', label: 'Kostum Superglen' },
  { id: 'glen', label: 'Baju Glen' },
  { id: 'bike', label: 'Sepeda' },
  { id: 'ride', label: 'Kendaraan' },
];

export const SHOP_ITEMS: readonly ShopItem[] = [
  { id: 'sg-red', tab: 'superglen', name: 'Merah Klasik', price: 0, slot: 'superglen', value: 'sg-red', colors: ['#d8231f'], art: 'costume' },
  { id: 'sg-blue', tab: 'superglen', name: 'Biru Laut', price: 40, slot: 'superglen', value: 'sg-blue', colors: ['#1f78d8'], art: 'costume' },
  { id: 'sg-green', tab: 'superglen', name: 'Hijau Hutan', price: 40, slot: 'superglen', value: 'sg-green', colors: ['#2e9e4a'], art: 'costume' },
  { id: 'sg-purple', tab: 'superglen', name: 'Ungu', price: 50, slot: 'superglen', value: 'sg-purple', colors: ['#8e4fd8'], art: 'costume' },
  { id: 'sg-gold', tab: 'superglen', name: 'Emas', price: 80, slot: 'superglen', value: 'sg-gold', colors: ['#f2b632'], art: 'costume' },
  { id: 'sg-merahputih', tab: 'superglen', name: 'Merah Putih', price: 200, slot: 'superglen', value: 'sg-merahputih', colors: ['#e8202a', '#ffffff'], art: 'costume' },
  { id: 'sg-holo', tab: 'superglen', name: 'Hologram', price: 300, slot: 'superglen', value: 'sg-holo', colors: ['#22e6ff', '#7c6cff', '#ff5fd2'], art: 'costume' },

  { id: 'glen-orange', tab: 'glen', name: 'Oranye', price: 0, slot: 'glen', value: 'glen-orange', colors: ['#f26b00'], art: 'shirt' },
  { id: 'glen-blue', tab: 'glen', name: 'Biru', price: 25, slot: 'glen', value: 'glen-blue', colors: ['#2a7de1'], art: 'shirt' },
  { id: 'glen-green', tab: 'glen', name: 'Hijau', price: 25, slot: 'glen', value: 'glen-green', colors: ['#34a853'], art: 'shirt' },
  { id: 'glen-yellow', tab: 'glen', name: 'Kuning', price: 30, slot: 'glen', value: 'glen-yellow', colors: ['#f6c800'], art: 'shirt' },
  { id: 'glen-red', tab: 'glen', name: 'Merah', price: 30, slot: 'glen', value: 'glen-red', colors: ['#e0322b'], art: 'shirt' },
  { id: 'glen-striped', tab: 'glen', name: 'Belang-belang', price: 45, slot: 'glen', value: 'glen-striped', colors: ['#2a7de1', '#ffffff', '#2a7de1', '#ffffff'], art: 'shirt' },

  { id: 'bike-default', tab: 'bike', name: 'Warna Asli', price: 0, slot: 'bike', value: 'bike-default', colors: ['#e8453c', '#2ec4b6', '#ff9f43'], art: 'bike' },
  { id: 'bike-red', tab: 'bike', name: 'Sepeda Merah', price: 20, slot: 'bike', value: 'bike-red', colors: ['#e8302a'], art: 'bike', paint: 0xe8302a },
  { id: 'bike-blue', tab: 'bike', name: 'Sepeda Biru', price: 20, slot: 'bike', value: 'bike-blue', colors: ['#2a7de1'], art: 'bike', paint: 0x2a7de1 },
  { id: 'bike-green', tab: 'bike', name: 'Sepeda Hijau', price: 20, slot: 'bike', value: 'bike-green', colors: ['#34a853'], art: 'bike', paint: 0x34a853 },
  { id: 'bike-yellow', tab: 'bike', name: 'Sepeda Kuning', price: 20, slot: 'bike', value: 'bike-yellow', colors: ['#f6c800'], art: 'bike', paint: 0xf6c800 },
  { id: 'bike-purple', tab: 'bike', name: 'Sepeda Ungu', price: 25, slot: 'bike', value: 'bike-purple', colors: ['#8e4fd8'], art: 'bike', paint: 0x8e4fd8 },
  { id: 'bike-sparkle', tab: 'bike', name: 'Sepeda Berkilau', price: 45, slot: 'bike', value: 'bike-sparkle', colors: ['#ff6fb5', '#ffe27a'], art: 'bike', paint: 'sparkle' },
  { id: 'bike-racing', tab: 'bike', name: 'Sepeda Balap', price: 90, slot: 'bike', value: 'bike-racing', colors: ['#ffffff', '#e8302a'], art: 'racer', paint: 0xf2f2f2 },

  { id: 'ride-bike', tab: 'ride', name: 'Sepeda', price: 0, slot: 'ride', value: 'bike', colors: ['#2ec4b6'], art: 'bike' },
  { id: 'skateboard', tab: 'ride', name: 'Papan Luncur', price: 100, slot: 'ride', value: 'skateboard', colors: ['#ff9f43', '#4dabf7'], art: 'skateboard' },
];

export const ITEM_BY_ID: ReadonlyMap<string, ShopItem> = new Map(SHOP_ITEMS.map((i) => [i.id, i]));

/** Items the ride slot treats as owned without a purchase ('bike' is the free default vehicle). */
export const FREE_IDS: readonly string[] = ['sg-red', 'glen-orange', 'bike-default', 'ride-bike'];

/** Sepeda Balap: a little faster than the normal bike (the normal numbers are `BikeConfig.ride`). */
export const RacingBike = { runSpeed: 10.2, accel: 9.5 } as const;

/**
 * Shopkeeper lines. `id` is the key for the voice files to be recorded later (audio id `shop_<id>`); the game shows `text` now.
 * `{n}` is replaced by a number of coins, `{item}` by the item name.
 */
export const ShopLines = {
  hello: { id: 'shop_hello', text: 'Selamat datang di Toko Mainan! Mau lihat-lihat?' },
  wardrobe: { id: 'shop_wardrobe', text: 'Ini lemarimu. Pilih yang mau dipakai!' },
  ask: { id: 'shop_ask', text: 'Wah, bagus! Mau beli {item}?' },
  bought: { id: 'shop_bought', text: 'Terima kasih! {item} sekarang milikmu.' },
  short: { id: 'shop_short', text: 'Koinmu belum cukup. Kurang {n} koin lagi ya. Kumpulkan dulu, yuk!' },
  equipped: { id: 'shop_equipped', text: 'Keren! Kamu memakai {item}.' },
  bye: { id: 'shop_bye', text: 'Sampai jumpa lagi, ya!' },
  empty: { id: 'shop_empty', text: 'Belum ada barang di sini. Belanja dulu, yuk!' },
} as const;

export const fill = (text: string, vars: { n?: number; item?: string }): string => text.replace('{n}', String(vars.n ?? 0)).replace('{item}', vars.item ?? '');
