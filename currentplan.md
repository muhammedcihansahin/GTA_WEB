# 🎮 GTA San Andreas Web - Gerçekçi GLB Modeller, Araç Çarpışma Fiziği, Carjacking & NPC İskelet Düzeltmeleri Master Planı

**Son Güncelleme:** 30 Eylül 2026, 22:50  
**Önceki Plan:** `eskimdler/eskiplan(9).md` (Acil Servis Yan Görevleri & Vigilante FSM planı arşivlendi)  
**Durum:** TÜM ADIMLAR (ADIM 1, ADIM 2, ADIM 3 & ADIM 4) BAŞARIYLA TAMAMLANDI (%100)  

---

## 📊 Genel Durum ve İlerleme Özeti

| Aşama | Başlık | Durum |
| :--- | :--- | :---: |
| **ADIM 1** | Minecraft Tarzı Kutu Modellerin (İtfaiye, Polis, Ambulans, Trafik) Kaldırılması ve Gerçekçi 3D GLB Modellerle Değiştirilmesi | ✅ Tamamlandı (%100) |
| **ADIM 2** | Araçların İçinden Geçilme Sorununun Çözülmesi (Oyuncu - Araç ve Araç - Araç Çarpışma / Katı Kalkan Fiziği) | ✅ Tamamlandı (%100) |
| **ADIM 3** | Sokaktaki NPC Araçlarına Binme (Nissan'a Dönüşme) Hatasının Giderilmesi ve NPC Boyut/Duruş (Dev Boyut, Yan Yatma) Sorunlarının Çözülmesi | ✅ Tamamlandı (%100) |
| **ADIM 4** | NPC El, Ayak, Yürüme ve İskelet Animasyon Bozukluklarının Düzeltilmesi | ✅ Tamamlandı (%100) |

---

## 🛠️ Tamamlanan Adımlar (Özet)

*Önceki döngülerde tamamlanan ve kalıcı olarak çekirdeğe entegre edilen devasa sistemler (`eskimdler/eskiplan(9).md` altında tam arşivlenmiştir):*

* **Çekirdek Motor, GPU & Trafik:** 360° güvenlik frustum culling, Ackermann çevik araç fiziği, 60 FPS WebGL2 motoru, Torus bubble streaming ve anti-clipping çarpışma kalkanı.
* **Grove vs Ballas Çete Savaşları:** Bölge sınırları, 3 dalgalı Turf War FSM, bölge ele geçirme ve yeşil çete nüfusu devri.
* **LSPD Taktik Polis & Helikopter:** 3+ yıldızda arama projektörlü Police Maverick, yol barikatları, çivi tuzakları ve patlak lastik fiziği.
* **İnteraktif Sokak Görevleri:** Sweet/Big Smoke çalan telefon kulübesi, Drive-Thru / Ballas pususu görevi ve sinematik letterbox.
* **Silah Çarkı & Toplanabilir Öğeler:** Dönen 3D can kalbi, çelik yelek, düşen para desteleri, cephane sandığı ve 4 slotlu silah envanteri (Yumruk, 9mm, Micro SMG, Pompalı).
* **Los Santos Araç Radyoları:** Web Audio Lookahead Audio Scheduler ile 5 kesintisiz radyo istasyonu, analog cızırtı ve dinamik AnalyserNode retro ekolayzır HUD.
* **Pay 'n' Spray Garajı:** Animasyonlu dikey kepenk kapı, 3D dönen boya dumanı, 12 metalik renk paleti, lastik onarımı ve aranma seviyesi sıfırlama.
* **Acil Servis Yan Görevleri:** Web Audio çift tonlu sirenler (Wail & Yelp), tazyikli su jeti ve yangın söndürme partikül sistemi, mini-harita hasta haç ve yangın alev blipleri, 12 seviyeli Paramedic & Firefighter FSM.
* **ADIM 1 (Gerçekçi GLB Kamu ve Acil Araçları):**
  - Tüm ilkel `BoxGeometry` kutu modeller (Ambulans, İtfaiye, Polis, Trafik Fallback) oyundan tamamen temizlendi (Kural 7 tam uygulandı).
  - LSPD Polis Cruiser (Mercedes-Benz E50 AMG), Los Santos Ambulansı (Ganton SUV) ve İtfaiye Engine 5 (Tavan Su Tareti & Nozul) gerçekçi 3D GLB modelleriyle donatıldı.
* **ADIM 2 (Araç Katı Kalkan & Çarpışma Fiziği Motoru):**
  - `VehicleCollisionSolver.js` ile dinamik OBB oyuncu-araç katı kalkanı, 2 m/s üstü hızlarda knockback ezilme/hasar mekaniği ve araç-araç 3-kapsüllü elastik momentum çarpışma fiziği uygulandı.
* **ADIM 3 (NPC Araç Çalma Model Sadakati & NPC Boyut/Duruş Düzeltmesi):**
  - `NpcVehicle` sınıfında `templateScene`, `modelOptions`, `vehicleType` ve `vehicleName` meta verileri kalıcı hale getirildi.
  - `main.js` içindeki trafik şablon havuzuna (Alfa Romeo Giulia, Alfa Spider, Mercedes-Benz E50, BMW Vision, Los Santos SUV) tam kimlik atandı.
  - `carjackNpcVehicle` içerisindeki sabit Nissan GT-R yerine, çalınan aracın orijinal şasisi, model ölçeği, tipi ve metalik gövde rengi korunarak sürülebilir araca aktarıldı.
  - `gta_cop`, `michael` ve `tracey` için gereksiz `-Math.PI / 2` rotasyonu kaldırılarak modellerin asfalta yan/yüzüstü yatması önlendi (`rotX: 0`).
  - `PedestrianVisualController` içerisindeki `this.baseY` tanımlanarak `NaN` pozisyon bozulması giderildi; yükseklik hesabında `scaleFactor` için güvenlik kelepçesi konarak yayaların 15 metrelik devlere dönüşmesi tamamen engellendi.
* **ADIM 4 (NPC El, Ayak, Yürüme ve İskelet Animasyon Düzeltmesi):**
  - GLB modellerinin (`mellstroy`, `suit_man`, `claude`) iç iskelet yapıları python ile taranarak tüm alt uzuv kemikleri (`leftForeArm`, `rightForeArm`, `leftLowerLeg`, `rightLowerLeg`, `torso`, `head`, `pelvis`) katalog tanımlarına dahil edildi.
  - Model koordinat referans ekseni kuaterniyon eşleniği ($Q_{rel}^{-1} \cdot (-1, 0, 0)$) ile her kemiğin yerel eksen matrisleri `_initRig` içinde otomatik olarak hesaplandı; 3ds Max Biped ve Blender Rigify riglerinin göğse batma veya ters dönme sorunları tamamen çözüldü.
  - İki kemikli kinematik mafsal formülüyle ($\max(0, \pm\cos(\text{animPhase})) \times \text{kneeMaxFlex}$) bacak geriye doğru itilirken ve öne geçerken dizler doğal açıyla geriye doğru büküldü; baston bacak yürüyüşü giderildi.
  - Kollar sallanırken dirseklere doğal fleksör dinlenme açısı ($16^\circ - 32^\circ$) ve omurga torsiyonu eklendi.
  - Adım uzunluğu ($L_{stride} \approx 0.71\text{m}$) formülü $\omega = 4.42 \times \text{speed}$ ile yayanın zemin hızı faz değişimine kilitlenerek asfaltta ayak kayması (foot sliding) engellendi.

---

## 🎯 Şuan Çözülecek Adım ve Geniş Çaplı Çözüm Mimarisi

* Bu plandaki tüm 4 adım başarıyla tamamlanmıştır.

---

## 📋 Sırada Bekleyen Adımlar

* Bu md dosyasındaki tüm adımlar tamamlandı.