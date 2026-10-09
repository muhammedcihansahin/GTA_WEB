# PROMPTLAR

## Prompt 1: Plan Kontrolü ve Yönlendirme (Orchestrator)

```text
Şimdi currentplan md dosyasını kontrol etmeni ve tüm adımlar tamamlanmış mı bakmanı istiyorum. 

Eğer tüm adımlar tamamlanmış ise promptlar md dosyasındaki Prompt 2'yi aynen uygula. 

Eğer tüm adımlar tamamlanmamış ise promptlar md dosyasındaki Prompt 3'ü aynen uygula.
```

---

## Prompt 2: Hata / İhtiyaç Tespiti ve Yeni Plan Oluşturma

```text
1.

currentplan md dosyasının içindekileri eskiplan(x) md dosyasına aktar ve bu dosyayı da eskimdler içine at,kalabalık olmasın.
(x burda eski md dosyasına bağlı, eskilerden 4 tane birikmişse bu x 1 artacak tabi ve 5 olacak mesela.).

Şimdi oyunda bir kaç sıkıntı var halen, ama sen bunu halledebilirsin diye düşünüyorum,
benim gördüğüm sorunlardan bazısı : 


(eğer bu kısım boşsa sen kendin oyundaki sorunları/eksikleri bul ve adımlara ekle.)

......

Yapılması gerekenleri bulunca yeni bir currentplan md dosyası oluştur. Ve yeni currentplan md dosyasındaki adımları da 1 den başlatarak numaralandır.

Oluşturduğun yeni currentplan md dosyasına şu bölümleri de ekle : 
Genel Durum ve İlerleme Özeti, 
Tamamlanan Adımlar (Özet),
Şuan Çözülecek Adım ve Geniş Çaplı Çözüm Mimarisi,
Sırada Bekleyen Adımlar.

başka da bir şey yapma.


```

---

## Prompt 3: Adım Adım Çözüm ve Plan İlerlemesi

```text
şimdi yine currentplan md'deki adımlara devam edelim, eğer hepsi tamamlanmamışsa tabi. Bütün adımlar tamamlanmışsa Bana sadece "Bu md dosyasındaki tüm adımlar tamamlandı."  yaz ve başka hiçbir şey yapma. 

hangi adımdaysan onun için geniş çaplı bir (teknik olarak ayrıntılı açıklamalar içeren)çözüm planla.
Olabildiğince browser kullanmamaya çalış; gerekirse testleri ben yaparım, sana bildiririm sen bana söyle yeter ki. 
Şuan çözülecek adım ve çözümü kısmını da güncelle bu md dosyasında(dediğim gibi sadece o adımın çözümü olacak, diğer adımların çözümü olmayacak). 
haydi başla bakalım.
```
