# NhacCuaTui MP3 API

Server Node.js + Express de tim bai hat tren NhacCuaTui va tra ve link MP3 truc tiep cho ESP32 phat nhac.

## Chay local

```bash
npm install
npm start
```

Mac dinh server chay tai:

```text
http://localhost:5555
```

Render se tu dung bien moi truong `PORT`, nen khong can cau hinh them.

## API

### `GET /api/search?q=<keyword>`

Vi du:

```bash
curl "http://localhost:5555/api/search?q=lac%20troi"
```

Ket qua:

```json
{
  "source": "nhaccuatui",
  "query": "lac troi",
  "total": 3,
  "songs": [
    {
      "title": "Lac Troi",
      "artist": "Son Tung M-TP",
      "duration": 233,
      "thumbnail": "https://...",
      "streamUrl": "https://...mp3..."
    }
  ]
}
```

Firmware ESP32 chi can lay `songs[0].streamUrl` va phat truc tiep URL do. API nay khong dung `encodeId` cua Zing MP3.

### `GET /health`

Kiem tra server:

```json
{ "ok": true, "source": "nhaccuatui" }
```

## UI test

Mo trinh duyet:

```text
http://localhost:5555/
```

Nhap tu khoa, bam tim kiem, sau do bam `Phat` de test `streamUrl` truc tiep.

## Ghi chu ky thuat

- Nguon du lieu: `https://graph.nhaccuatui.com`
- Search endpoint upstream: `/api/v1/search/song`
- Detail endpoint upstream: `/api/v1/song/detail/{key}`
- Server tu dong bo qua ket qua khong lay duoc `streamUrl` va fallback sang bai tiep theo trong danh sach.
- Uu tien stream 128kbps neu co, vi phu hop hon cho ESP32.
- Neu NhacCuaTui thay doi API noi bo, can cap nhat lai `server.js`.
