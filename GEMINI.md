# SON DURUM (30 Eylül 2026, 22:50)
* **Proje:** 3D GTA San Andreas / Grove Street Web Oyunu (Three.js r128+, ESM, Vanilla JS/CSS).
* **Master Plan Durumu:** 4 Kritik Çözüm Adımının Tümü Tamamlandı:
  - **ADIM 1:** Minecraft Tarzı Kutu Modellerin (İtfaiye, Polis, Ambulans, Trafik) Kaldırılması ve Gerçekçi 3D GLB Modellerle Değiştirilmesi *(✅ Tamamlandı)*
  - **ADIM 2:** Araçların İçinden Geçilme Sorununun Çözülmesi (Oyuncu - Araç ve Araç - Araç Çarpışma / Katı Kalkan Fiziği) *(✅ Tamamlandı)*
  - **ADIM 3:** Sokaktaki Arabalara Binme Hatasının (Nissan'a Dönüşme) ve NPC Boyut/Duruş Bozukluklarının Giderilmesi *(✅ Tamamlandı)*
  - **ADIM 4:** NPC El, Ayak, Yürüme ve İskelet Animasyon Bozukluklarının Giderilmesi *(✅ Tamamlandı)*
* **Çalıştırma:** `oyna.bat` veya `python -m http.server 3000` -> `http://localhost:3000/oyna.html`.
* **Geliştirici & Test Kolaylığı:** 
  - `Tab` tuşu ile araçlara binme / araçlar arası geçiş.
  - LSPD Polis Cruiser Spawn: `window.spawnPoliceCarAhead(5)`.
  - Ambulans Spawn: `window.spawnAmbulanceAhead(5)`.
  - İtfaiye Aracı Spawn: `window.spawnFireTruckAhead(6.5)`.
  - Paramedic Görevi Başlat/Bitir: Ambulanstayken `2` veya `Caps Lock`, ya da konsoldan `window.startParamedicMission(1)`.
  - Firefighter Görevi Başlat/Bitir: İtfaiyedeyken `2` veya `Caps Lock`, ya da konsoldan `window.startFirefighterMission(1)`.
  - Su Jeti Fışkırtma: İtfaiye aracındayken `Sol Tık` veya `Space` tuşuna basılı tutma.
  - Tepe Sireni / Flaşör Aç/Kapa: Acil araçtayken `H` veya `E` tuşu.
  - Hastaneye Işınlanma: `window.teleportToHospital()`.
  - Aktif Acil Servis Hedefine (Hasta/Yangın) Işınlanma: `window.teleportToActiveEmergencyTarget()`.
  - Pay 'n' Spray Garajına Işınlanma: `window.teleportToPayNSpray()`.
  - Anında Boyama & Aranma Seviyesi Silme: `window.triggerPayNSpray()`.
  - Aranma Seviyesi Testi: `window.setWantedStars(3)`.
  - NPC Araç Çalma (Carjacking): Sol kapıya yaklaşıp `F` veya `Enter` tuşuna basma.
  - En Yakın NPC Aracı Anında Çalma: `window.carjackNearestNpcVehicle()`.
  - Önüne Çalınabilir NPC Araç Koyma: `window.spawnNpcCarAhead(5)`.
  - Radyo Değiştirme: `R` (Sonraki İstasyon) / `Shift + R` (Önceki İstasyon) veya `window.nextRadioStation()` / `window.prevRadioStation()`.
  - Radyo İstasyon Seçimi: `window.setRadioStation('LOS_SANTOS')` *(LOS_SANTOS, PLAYBACK, KDST, BOUNCE, KROSE, OFF)*.
  - Silah Geçişi: `Q` tuşu veya Fare Tekerleği (Scroll), ya da `1-4` rakam tuşları.
  - Silah Slotu Seçimi: `window.selectWeaponSlot(idx)` *(0: Yumruk 👊, 1: 9mm Tabanca 🔫, 2: Micro SMG ⚡, 3: Pompalı Tüfek 💥)*.
  - Can Kalbi Üretme: `window.spawnHealthPickupAhead(4)`.
  - Çelik Yelek Üretme: `window.spawnArmorPickupAhead(4)`.
  - Para Destesi Üretme: `window.spawnMoneyPickupAhead(4, 250)`.
  - Cephane Sandığı Üretme: `window.spawnAmmoPickupAhead(4)`.
  - Görev Başlatma: `E` tuşu (kulübedeyken) veya `window.startDriveThruMission()`.
  - Telefon Kulübesine Işınlanma: `window.teleportToPayphone()`.
  - Görev Hedefine Işınlanma: `window.teleportToMissionMarker()`.

---

# Proje Kuralları ve Çalışma Prensipleri

Bu projedeki tüm yapay zeka asistanları (Antigravity/Gemini) aşağıdaki kurallara kesinlikle uymak zorundadır:

---

### 1. 🕒 Tarih ve Saat Bilgisi
* **HER CEVABIN EN BAŞINDA**, o anki tarihi ve saati (dakikasına kadar) yazarak başla.
* *Format Örneği:* `📅 12 Eylül 2026, 20:55` veya `📅 Tarih: 12.09.2026 | Saat: 20:55`

---

### 2. ⚡ Doğrudan Karar Ver ve İlerle (Onay Sorma Kuralı Kaldırıldı)
* Kullanıcı bir şey söylediğinde, talimat verdiğinde veya md dosyalarında/planlarda yapılacak iş belliyse **kesinlikle "onaylıyor musunuz?" gibi sorular sorma**.
* Durumu analiz et, kararları vererek doğrudan uygulamaya geç ve sonucu bildir.
* Yalnızca kullanıcı açıkça "önce bana sor" derse onay iste.

---

### 3. 🎯 Hedef Odaklı ve Minimal Araç Kullanımı
* Tüm projeyi baştan sona taramak yerine sadece doğrudan hedeflenen dosyalara ve satırlara odaklan.
* Dosya okurken gereksiz yere binlerce satır okuma; sadece ilgili satır aralıklarını incele.
* Yanlış anlama ve tekrar tekrar düzeltme döngülerine girerek token ve zaman israfına yol açma.

---

### 4. 💬 İletişim Tarzı
* Türkçe, kısa, net ve odaklı yanıtlar ver.
* Gereksiz uzun teorik açıklamalar yerine doğrudan çözüme ve eyleme yönelik ol.

---

### 5. 🧠 İstemi Optimize Etme (İç Prompt ve Doğrulama)
* Kullanıcının talebini; token tasarrufu, maksimum hız ve sıfır hata hedefiyle optimize edilmiş yapılandırılmış bir iç plana dönüştür.
* Bu planın/eylemin kısa bir özetini kullanıcıya sun ve onayını almadan eyleme geçme.

---

### 6. 🚜 Tarayıcı Testlerinde Araçlara Işınlanma Kuralı (Token ve Adım Tasarrufu)
* Tarayıcı testlerinde (browser subagent) araçları test etmek veya araca binmek için **ASLA W TUŞUNA BASARAK YÜRÜMEYE ÇALIŞMA**. Yürümek onlarca ekran görüntüsü ve gereksiz token israfına yol açar.
* Bunun yerine Farming Simulator tarzı tek tuşla ışınlan:
  * **Klavyeden:** Doğrudan `Tab` tuşuna bas (en yakın araca anında biner, tekrar basınca araçlar arası sırayla geçer).
  * **Konsoldan / JS Eval:** `window.teleportToVehicle(0)` veya `window.cycleVehicle(1)` çalıştır.
  * **Harita Işınlanması:** `window.teleportPlayer(x, z)` ile istenen koordinata anında git.

---

### 7. 🚫 Asla Minecraft / Kutu Modeller Kullanmama Kuralı
* Oyuna yeni bir araç, NPC, bina veya nesne ekleneceği zaman **ASLA Minecraft tarzı ilkel küplerden/kutulardan (BoxGeometry) oluşan gerçekçi olmayan modeller eklenmeyecektir**.
* Her zaman gerçekçi, estetik ve GTA dokusuna uygun detaylı 3D GLB modelleri veya projedeki yüksek kaliteli 3D mesh varlıkları kullanılacaktır.


