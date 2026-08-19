# Hướng dẫn Deploy ezBookkeeping (fork có Budgeting + Rules Engine)

Kiến trúc tổng thể khi ra Internet qua Cloudflare Tunnel:

```
Người dùng ──HTTPS──> Cloudflare Edge (ez.yourdomain.com)
                          │  (outbound tunnel, không mở port trên server)
                          ▼
                    cloudflared (chạy trên VPS)
                          │  http://127.0.0.1:12080
                          ▼
                    Docker container ezbookkeeping :8080
                          │
                          ▼
                    SQLite (volume ./data) hoặc PostgreSQL/MySQL
```

Điểm mấu chốt: **server không mở bất kỳ port công khai nào cho ứng dụng**. cloudflared
tự tạo kết nối outbound đến Cloudflare, traffic vào qua tên miền. Port local (ví dụ
12080) chỉ lắng nghe trên `127.0.0.1` nên dù là port nào cũng không bị quét từ ngoài.

## Image Docker

Workflow `.github/workflows/docker-publish.yml` tự build và push image lên GitHub
Container Registry mỗi khi push vào branch `feature/budgeting-rules` hoặc đẩy tag `v*`:

```
ghcr.io/vibecoder11200/ezbookkeeping:latest          # đầu mới nhất của branch
ghcr.io/vibecoder11200/ezbookkeeping:feature-budgeting-rules-<sha>
ghcr.io/vibecoder11200/ezbookkeeping:1.2.3           # khi đẩy tag v1.2.3
```

Lần đầu CI chạy, package trên ghcr.io mặc định là **private**. Vào
`github.com/vibecoder11200?tab=packages` → package `ezbookkeeping` → Package settings
→ Change visibility → Public nếu muốn server (hoặc khách hàng) pull mà không cần login.
Nếu giữ private: server phải `docker login ghcr.io` bằng PAT có scope `read:packages`.

## Bước 1 — Chuẩn bị trên server

```bash
# Debian/Ubuntu
curl -fsSL https://get.docker.com | sh

mkdir -p /opt/ezbk && cd /opt/ezbk
```

## Bước 2 — docker-compose.yml

Tạo `/opt/ezbk/docker-compose.yml`:

```yaml
services:
  ezbookkeeping:
    image: ghcr.io/vibecoder11200/ezbookkeeping:latest
    container_name: ezbk
    restart: unless-stopped
    ports:
      - "127.0.0.1:12080:8080"   # CHỈ lắng nghe loopback, cloudflared sẽ trỏ vào đây
    environment:
      - EBK_DATA_ENABLE_BUDGETING=true
      - EBK_DATA_ENABLE_RULES_ENGINE=true
      # Thêm các override khác theo dạng EBK_<SECTION>_<ITEM>, ví dụ:
      # - EBK_DATABASE_TYPE=postgres
      # - EBK_DATABASE_HOST=10.0.0.2:5432
    volumes:
      - ./data:/ezbookkeeping/data        # SQLite DB nằm ở đây
      - ./storage:/ezbookkeeping/storage  # ảnh giao dịch, avatar
      - ./log:/ezbookkeeping/log
```

Chạy:

```bash
docker compose up -d
docker compose logs -f    # Ctrl+C để thoát, thấy "http server is listening" là ổn
```

Kiểm tra locally: `curl -s http://127.0.0.1:12080/api/server_info.json` (kết quả JSON
là được; nếu 404 vẫn ổn miễn có phản hồi).

## Bước 3 — Nối cloudflared (3 trường hợp)

### Case A — cloudflared chạy bằng systemd, tunnel quản lý bằng file config (config.yml)

Kiểm tra: `cat /etc/cloudflared/config.yml` — nếu có `tunnel:` + `credentials-file:`
là case này. Sửa file thêm ingress (đặt TRƯỚC dòng catch-all `404` nếu có):

```yaml
tunnel: <tunnel-id-hiện-tại>
credentials-file: /etc/cloudflared/<tunnel-id>.json

ingress:
  - hostname: ez.yourdomain.com
    service: http://127.0.0.1:12080
  - service: http_status:404
```

Đảm bảo DNS trỏ tên miền về tunnel:

```bash
cloudflared tunnel route dns <tunnel-id> ez.yourdomain.com
sudo systemctl restart cloudflared
```

### Case B — cloudflared chạy bằng systemd, tunnel quản lý từ Dashboard (remote-managed, chạy bằng token)

Kiểm tra: `systemctl cat cloudflared` mà thấy `tunnel run --token ...` là case này.
Ingress KHÔNG nằm trong file trên server — làm trên web:

1. Vào Cloudflare Zero Trust (one.dash.cloudflare.com) → Networks → Tunnels
2. Chọn tunnel → Public Hostname → Add a public hostname
3. Subdomain `ez`, domain `yourdomain.com`, service: `http://127.0.0.1:12080`
4. Save — có hiệu lực ngay, không cần restart cloudflared

Lưu ý: vì cloudflared trong case này vẫn chạy trên host, nó tới được port
`127.0.0.1:12080` do compose publish vào loopback của host.

### Case C — cloudflared chạy chung trong docker-compose (một file duy nhất, không đụng systemd)

Gọn nhất khi muốn "mọi thứ trong compose" (dễ đóng gói bán cho khách tự deploy):

```yaml
services:
  ezbookkeeping:
    image: ghcr.io/vibecoder11200/ezbookkeeping:latest
    # KHÔNG cần ports: nữa — cloudflared gọi thẳng qua mạng nội bộ compose
    environment:
      - EBK_DATA_ENABLE_BUDGETING=true
      - EBK_DATA_ENABLE_RULES_ENGINE=true
    volumes:
      - ./data:/ezbookkeeping/data
      - ./storage:/ezbookkeeping/storage
      - ./log:/ezbookkeeping/log
    networks:
      - ezbk-net

  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: ezbk-tunnel
    restart: unless-stopped
    command: tunnel --no-autoupdate run --token <TOKEN_TỪ_DASHBOARD>
    networks:
      - ezbk-net

networks:
  ezbk-net:
```

Token lấy ở Zero Trust → Networks → Tunnels → Create/Chọn tunnel → copy token.
Public Hostname trỏ tới service `http://ezbookkeeping:8080` (**tên container thay vì
127.0.0.1**). Không cần publish port nào ra host.

### Nên chọn case nào?

| Case | Khi nào dùng |
|---|---|
| A (systemd + config.yml) | Server tự quản, muốn tunnel độc lập với app — restart/rebuild app không ảnh hưởng tunnel |
| B (systemd + token/dashboard) | Giống A nhưng sửa route qua web, tiện khi quản nhiều tunnel |
| C (compose + token) | Đóng gói trọn bộ cho khách hàng self-hosted, hoặc không muốn đụng systemd |

## Bước 4 — Verify qua Internet

```bash
curl -s https://ez.yourdomain.com/server_settings.js | grep -o "_\['bg'\]=1\|_\['re'\]=1"
# phải ra cả 2 dòng: bg=1 (budgeting) và re=1 (rules engine)
```

Mở `https://ez.yourdomain.com` trên trình duyệt, đăng ký tài khoản đầu tiên và dùng
bình thường. Các tính năng Budgets / Rules xuất hiện trong mục cài đặt dữ liệu.

## Vận hành

**Nâng cấp bản mới:**

```bash
cd /opt/ezbk
docker compose pull
docker compose up -d        # cấu trúc DB tự cập nhật nhờ auto_update_database=true
```

**Backup:** với SQLite, an toàn nhất là dừng rồi nén:

```bash
docker compose stop
tar czf ezbk-backup-$(date +%F).tar.gz data storage
docker compose start
```

**Log:** `docker compose logs -f ezbk` hoặc file trong `./log/`.

## Lưu ý riêng khi đi qua Cloudflare Tunnel

- Free plan giới hạn **thân request 100MB** — ảnh giao dịch nhỏ nên vô tư, nhưng đừng
  dùng để import file CSV khổng lồ qua tunnel
- WebSocket hoạt động bình thường (dùng cho push notification)
- Không cần mở port / config firewall gì thêm cho app — nguyên tắc zero open port

## Phương án DB nghiêm túc hơn (nhiều user)

SQLite đủ cho cá nhân/nhóm nhỏ. Khi chạy SaaS nhiều user, thêm PostgreSQL:

```yaml
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      - POSTGRES_DB=ezbookkeeping
      - POSTGRES_USER=ezbk
      - POSTGRES_PASSWORD=<mật-khẩu-mạnh>
    volumes:
      - ./pgdata:/var/lib/postgresql/data
```

và trên app: `EBK_DATABASE_TYPE=postgres`,
`EBK_DATABASE_HOST=postgres:5432` (gọi tên container), kèm
`EBK_DATABASE_USER`/`EBK_DATABASE_PASSWD`/`EBK_DATABASE_NAME`.
