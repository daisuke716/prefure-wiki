# Go2 Jetson WiFi ネットワーク構築完全ガイド

Unitree Go2 ロボットドッグの Jetson 拡張ドックに USB WiFi アダプターを増設し、「WiFi 無線接続で NoMachine を使う + PC の有線ネットワークをブリッジしてインターネットに出る」構成を実現するまでの全過程を記録する。途中でハマった落とし穴と最終的な解決策を含む。

---

## 1. 背景と目的

- Jetson（Go2 ロボット本体に搭載されているオンボードコンピューター）に USB WiFi アダプター（RTL8812BU）を増設し、`go2` という名前のホットスポットを外部に向けてブロードキャストする
- 目的1：外部 PC が WiFi で `go2` ホットスポットに接続すれば、NoMachine で Jetson のデスクトップにリモートアクセスできるようにする（LAN ケーブル不要）
- 目的2：Jetson 自身のインターネット接続は、WiFi 経由で逆に外部 PC のネットワークに「相乗り」する方式に変更する（PC が有線でインターネットに接続し、Jetson が WiFi で PC に接続、PC がそのネットワークを Jetson に共有する）
- `eth0`（Jetson の唯一の物理有線ポート）はロボット本体ネットワーク（`192.168.123.0/24`、ロボットのメインコントローラーは `192.168.123.161`）への接続専用とする

---

## 2. ハードウェアとドライバ：RTL8812BU アダプターの導入

### 2.1 ハードウェアの確認

```bash
lsusb
# Bus 001 Device 002: ID 0bda:b812 Realtek Semiconductor Corp. USB3.0 802.11ac 1200M Adapter
```

チップ型番は `0bda:b812`、すなわち **RTL8812BU / RTL88x2BU** で、2.4G/5G デュアルバンド AC1200 に対応する。

### 2.2 ドライバの状況説明

- このチップ（`0bda:b812`）のドライバは、Linux 6.4 前後になってようやく `rtw88`（`CONFIG_RTW88_8822BU`）としてカーネル本流にマージされ、6.12 以降で安定してきた。Ubuntu 22.04 の HWE カーネルや 24.04 のデフォルトカーネル（6.8 以降）はいずれもこのマージ時期より新しいため、これらの環境では挿すだけでそのまま使え、手動コンパイルは不要である
- しかし今回の Jetson が使っているのは、Unitree 公式が Ubuntu 20.04 ベースでカスタマイズした古いベンダーカーネル（`5.10.104-tegra`）であり、上記のマージ時期よりはるかに前のものなので、カーネル内にこのチップのドライバは存在しない。そのため、`rtl88x2bu`（コミュニティメンテナンス版、Realtek 公式が公開したベンダーソースコードをベースにしたもので、[cilynx/rtl88x2bu](https://github.com/cilynx/rtl88x2bu) から入手）を手動でコンパイル・インストールする必要がある。カーネルヘッダも既に対応するものが用意されている（`/usr/src/linux-headers-5.10.104-tegra-ubuntu20.04_aarch64`）

ソースコードの取得：

```bash
git clone https://github.com/cilynx/rtl88x2bu.git /usr/src/rtl88x2bu-5.8.7.1
sudo dkms add -m rtl88x2bu -v 5.8.7.1
```

### 2.3 落とし穴：Makefile のプラットフォーム判定バグ

ドライバのデフォルト Makefile では `CONFIG_PLATFORM_I386_PC` と `CONFIG_PLATFORM_ARM_RPI` の両方が `y` に設定されており、プラットフォーム判定ロジックの `ifeq` マッチングが失敗する。その結果、コンパイル時に算出されるカーネルパス（`KSRC`）が空になり、以下のエラーが出る：

```
make[1]: *** M=/var/lib/dkms/.../build: No such file or directory
```

**修正**：`/usr/src/rtl88x2bu-5.8.7.1/Makefile` を編集し、`CONFIG_PLATFORM_I386_PC` を `n` に変更する（`CONFIG_PLATFORM_ARM_RPI = y` はそのまま残す。このブランチは Raspberry Pi と汎用 aarch64 プラットフォームの両方をカバーしている）。

```bash
sudo sed -i 's/^CONFIG_PLATFORM_I386_PC = y/CONFIG_PLATFORM_I386_PC = n/' \
    /usr/src/rtl88x2bu-5.8.7.1/Makefile

# 変更が正しく反映されたか確認：
grep -E '^CONFIG_PLATFORM_(I386_PC|ARM_RPI)' /usr/src/rtl88x2bu-5.8.7.1/Makefile
```

### 2.4 コンパイルとインストール

```bash
sudo dkms build rtl88x2bu/5.8.7.1
sudo dkms install rtl88x2bu/5.8.7.1
sudo modprobe 88x2bu
```

ドライバのロードに成功すると `wlan0` が出現し、`iw list` で AP モード対応を確認できる。

---

## 3. ネットワーク構成設計：なぜ「単一セグメントで済ませる」ことができないのか

これは今回の一連の作業の中で最も核心となる技術ポイントであり、しっかり理解しておく必要がある。

### 3.1 最初の誤った設計

最初は `wlan0`（WiFi ホットスポット）も `192.168.123.0/24`（`eth0` やロボットの `.161` と同じセグメント）に設定していた。これで WiFi クライアントが「直接」ロボットにアクセスできると思い込んでいたためである。

**これは誤りだった**。理由は以下の通り：

- `eth0` とロボットの `.161` は物理的に**同一のスイッチ**に接続されており、本当に同じブロードキャストドメインなので、同一セグメントに設定しても問題ない
- 一方 `wlan0` の WiFi クライアントは**電波**で接続されており、`eth0` の LAN ケーブルとはまったく異なる物理媒体である。たとえ同じ IP セグメントを設定しても、クライアント側の OS は「同一セグメント＝同一の線」とみなし、ARP ブロードキャストで直接 `.161` の MAC アドレスを探そうとする——しかしこのブロードキャストは WiFi 電波の範囲内にしか伝わらず、有線側には決して届かない。そのため**ARP すら解決できず、パケットはそもそも送信すらされない**

パケットキャプチャ（`tcpdump -i wlan0 icmp`）で検証：60 秒のウィンドウ内で、クライアントがロボットに ping を送っても、Jetson の WiFi アダプター側では 1 パケットも受信されなかった。これにより、問題はクライアントがそもそもパケットを送出できていないことにあり、転送ルールの問題ではないことが確認できた。

### 3.2 正しい設計：異なるセグメント + ルーティング

**結論：IP セグメントはあくまで論理的な番号であり、「同一セグメントで直接通信できるか」は、物理トポロジーが本当に同一のブロードキャストドメインにあるかどうかで決まる。物理媒体をまたぐ場合（有線 ↔ WiFi）は必ずルーティング（異なるセグメント + ゲートウェイ転送）を使う必要があり、「同一セグメントに設定する」ことで誤魔化すことはできない。**

最終的な方案：

| インターフェース          | セグメント                             | 用途                              |
| ------------------------- | ------------------------------------ | --------------------------------- |
| `eth0`                  | `192.168.123.0/24`（静的 `.18`） | ロボット本体ネットワーク専用接続            |
| `wlan0`（`go2` ホットスポット） | `192.168.124.0/24`（`.1`）       | WiFi クライアント接続用、ロボットセグメントとは分離 |

WiFi クライアント（外部 PC）には静的 IP `192.168.124.223/24` を設定し、ゲートウェイは `192.168.124.1`（Jetson）を指す。こうすることで、PC が `192.168.123.161` 宛てに送るパケットは正しくゲートウェイ（Jetson）に送られ、Jetson がルーティングして転送する。WiFi セグメント内に存在しないデバイスを無駄に探しに行くことがなくなる。

（補足：本来は二層ブリッジ `br0` で `eth0` と `wlan0` を橋渡しし、真に同一のブロードキャストドメインにするのが「より正統な」解決策であり、実際に試してもみた。しかしこの `rtl88x2bu` ドライバはブリッジに組み込まれると、AP モードでのクライアントの WPA ハンドシェイクが失敗し、ログにはハンドシェイクの記録が一切残らなかった。そのためブリッジ方式は断念し、ルーティング方式に切り替えた。）

---

## 4. Jetson 側の設定

### 4.1 `eth0`：静的 IP、ロボット専用接続

```bash
sudo nmcli connection modify "Wired connection 1" \
  ipv4.method manual ipv4.addresses 192.168.123.18/24 ipv4.gateway 192.168.123.1
sudo nmcli connection up "Wired connection 1"
```

自動接続の優先度も上げておき、残っていたもう一つの DHCP 接続プロファイル（`Wired connection 2`、優先度 `-999`）に奪われないようにする：

```bash
nmcli connection modify "Wired connection 1" connection.autoconnect-priority 10
```

### 4.2 `wlan0`：`go2` ホットスポット、独立した新セグメント

`nmcli` でホットスポットを作成する（`ipv4.method` はデフォルトの `shared` ではなく `manual` を使う点に注意。こうすることで NAT や内蔵 DHCP を動かさず、指定したセグメントに収められる）：

```bash
nmcli device wifi hotspot ifname wlan0 ssid go2 password 12345678
nmcli connection modify Hotspot ipv4.addresses 192.168.124.1/24
nmcli connection up Hotspot
```

**起動時の自動有効化 + 5GHz 帯**（2.4GHz はデフォルトでは速度が遅いため、5GHz のチャンネル 36 に変更。非 DFS チャンネルの方が安定する）：

```bash
nmcli connection modify Hotspot \
  connection.autoconnect yes connection.autoconnect-priority 100 \
  802-11-wireless.band a 802-11-wireless.channel 36
nmcli connection up Hotspot
```

> 落とし穴の注意：GNOME の GUI にある「WiFi ホットスポットを有効にする」スイッチは、`ipv4.method=shared` の接続しか認識しない。今回のような `manual` モードのカスタムホットスポットは、GUI 上ではグレーアウトしたり状態が正しく認識されなかったりする。コマンドライン（`nmcli`/`sg netdev`）で管理するしかない。

### 4.3 転送 + NAT ルール

Unitree のカスタムシステムでは `iptables` の `FORWARD` チェーンのポリシーが `DROP` になっている（標準的な Linux のデフォルトは `ACCEPT`）ため、2 枚のネットワークカード間の転送を明示的に許可する必要がある：

```bash
sudo iptables -I FORWARD -i eth0 -o wlan0 -j ACCEPT
sudo iptables -I FORWARD -i wlan0 -o eth0 -j ACCEPT
```

NAT：ロボットの `.161` が受け取るリクエストを、あたかも Jetson 自身（`192.168.123.18`）から送られたように見せかける。こうして初めてロボット側は正しく応答パケットを返せる（`192.168.124.0/24` という見知らぬセグメントのことをロボットはまったく認識していないため）：

```bash
sudo iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
```

### 4.4 インターネット接続：WiFi 経由で PC を逆ブリッジ

Jetson に「予備のデフォルトルート」を追加し、`go2` ネットワーク内での PC の IP（ゲートウェイ）を指すようにする。metric は少し高めに設定し（例えば 500）、既存のルートを奪わず、必要な時だけフォールバックとして機能するようにする：

```bash
sudo ip route replace default via 192.168.124.223 dev wlan0 metric 500
```

（このコマンド中の `192.168.124.223` は、外部 PC が `go2` に接続した後の静的 IP である。第 5 節を参照。）

### 4.5 すべてを起動時自動実行に組み込む

上記のうち「ホットスポットの作成」を除く重要な項目を `/home/unitree/network_fix.sh` にまとめる：

```bash
#!/bin/bash

# eth0: 静的IP、ロボット本体ネットワーク専用
sudo nmcli connection modify "Wired connection 1" ipv4.method manual ipv4.addresses 192.168.123.18/24 ipv4.gateway 192.168.123.1
sudo nmcli connection up "Wired connection 1"

# wlan0: go2ホットスポット、独立したセグメント
sudo nmcli connection modify Hotspot ipv4.addresses 192.168.124.1/24
nmcli connection up Hotspot

# インターネット接続用の予備ルート：WiFi経由でPCをブリッジ
sudo ip route replace default via 192.168.124.223 dev wlan0 metric 500

# 転送ルール
sudo iptables -C FORWARD -i eth0 -o wlan0 -j ACCEPT 2>/dev/null || sudo iptables -I FORWARD -i eth0 -o wlan0 -j ACCEPT
sudo iptables -C FORWARD -i wlan0 -o eth0 -j ACCEPT 2>/dev/null || sudo iptables -I FORWARD -i wlan0 -o eth0 -j ACCEPT

# NAT
sudo iptables -t nat -C POSTROUTING -o eth0 -j MASQUERADE 2>/dev/null || sudo iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE

# DNS修正：手動(manual)ネットワークには自動DNSがないため、明示的に指定する必要がある
sudo nmcli connection modify "Wired connection 1" ipv4.dns "8.8.8.8 1.1.1.1" ipv4.ignore-auto-dns yes
sudo nmcli connection modify Hotspot ipv4.dns "8.8.8.8 1.1.1.1" ipv4.ignore-auto-dns yes
sudo resolvectl dns eth0 8.8.8.8 1.1.1.1
```

> 落とし穴の注意：`eth0`/`Hotspot` はいずれも `ipv4.method=manual`（静的）である。静的モードでは NetworkManager が自動的に DNS サーバーを書き込まないため、`/etc/resolv.conf` が空になったり、利用できないアドレスを指していたりして、名前解決がすべて失敗する（`ping 8.8.8.8` は通るが `ping www.baidu.com` が通らない、という状態になる）。DNS サーバーを明示的に指定し、自動 DNS 上書きを無効化する（`ipv4.ignore-auto-dns yes`）必要がある。

続いて systemd サービスを作成し、起動時にこのスクリプトを自動実行させる：

```bash
sudo tee /etc/systemd/system/network-fix.service << 'EOF'
[Unit]
Description=Go2 Jetson network fix (static eth0 + go2 AP + wifi internet bridge)
After=NetworkManager.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/home/unitree/network_fix.sh
User=root

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable network-fix.service
```

**起動時のネットワーク自己修復能力のまとめ**：

- `go2` ホットスポット：`autoconnect=yes` + 最高優先度 → 起動すれば必ず自動的にブロードキャストされ、いつでも WiFi で `192.168.124.1` に接続できる（SSH / NoMachine）
- `eth0` の静的 IP + 転送 + NAT + インターネット用ルート：`network-fix.service` が起動時に自動実行するため、手動での操作は一切不要

---

## 5. 外部 PC 側の設定（Ubuntu を例に）

PC 自体は有線（`enp4s0`）で本物のインターネットに接続し、WiFi（`wlo1`）で `go2` に接続する。

### 5.1 WiFi アダプター：新セグメントの静的 IP + ゲートウェイ

```bash
sudo nmcli connection modify go2 ipv4.method manual ipv4.addresses 192.168.124.223/24 ipv4.gateway 192.168.124.1
sudo nmcli connection up go2
```

### 5.2 自分のネットワークを Jetson に共有

```bash
sudo sysctl -w net.ipv4.ip_forward=1
sudo iptables -t nat -A POSTROUTING -o enp4s0 -j MASQUERADE
sudo iptables -I FORWARD -i wlo1 -o enp4s0 -j ACCEPT
sudo iptables -I FORWARD -i enp4s0 -o wlo1 -m state --state ESTABLISHED,RELATED -j ACCEPT
```

### 5.3 ロボットセグメントへの静的ルート（WiFi ゲートウェイ経由）

このルートを追加しないと、システムは `192.168.123.0/24` 宛てのトラフィックをデフォルトルート（実際のインターネット接続用ポート）経由で送出してしまい、Jetson にはまったく届かない：

```bash
sudo ip route replace 192.168.123.0/24 via 192.168.124.1 dev wlo1
```

### 5.4 スクリプトとして保存 + 起動時自動実行（任意）

`~/go2_network_fix.sh` として保存する（内容は上記 5.1〜5.3 のすべてのコマンド）。その後：

```bash
chmod +x ~/go2_network_fix.sh

sudo tee /etc/systemd/system/go2-network-fix.service << 'EOF'
[Unit]
Description=Go2 network fix (share internet to go2 hotspot)
After=NetworkManager.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/home/daisuke/go2_network_fix.sh
User=root

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable go2-network-fix.service
```

---

## 6. 最終検証結果

| テスト項目                                                 | 結果                  |
| ------------------------------------------------------ | --------------------- |
| PC の WiFi で `go2` に接続                                    | ✅                    |
| NoMachine が WiFi 経由で Jetson にアクセス（`192.168.124.1` に接続） | ✅                    |
| Jetson のインターネット接続（WiFi 経由で PC をブリッジ）                        | ✅ `ping 8.8.8.8` が通る |
| Jetson がロボット `192.168.123.161` に接続                     | ✅                    |
| PC（WiFi のみ、LAN ケーブル未接続）がロボット `192.168.123.161` に接続   | ✅                    |

**今後、SSH / NoMachine は統一して `192.168.124.1` に接続する**。もう以前の `192.168.123.19` は使わない。

---

## 7. 既知の残課題：DDS / SDK スクリプトが WiFi ブリッジ経由で使用できない

`unitree_sdk2py` の `VideoClient`（`ChannelFactoryInitialize`）や、ROS2 の DDS トピックをこの WiFi ブリッジ経由で使おうとすると、依然として接続できず、`send request error` / `VideoClient error code: 3102` のエラーが出る。

### 7.1 調査過程

1. まず iptables が UDP ポートをブロックしているのではと疑った —— **除外**：`FORWARD` チェーンにはポート制限が一切なく、全プロトコルを許可しており、`ping`（ICMP）や SSH ポートの疎通確認（TCP）も正常だった。
2. 真の原因は、**DDS が参加者発見（Discovery）にマルチキャストを利用している**ことにある。一方、通常の `ip_forward=1` + iptables 転送は**ユニキャストトラフィックのみを処理**し、マルチキャストをルーターをまたいで転送するには別途「マルチキャストルーティング」機能（IGMP/PIM など）が必要になる。これは IP プロトコル自体の設計であり、簡単に回避できる制限ではない。
3. `smcroute`（ユーザー空間のマルチキャストルーティングデーモン）を使って `wlan0`/`eth0` 間で DDS がデフォルトで使用するマルチキャストグループ `239.255.0.1` を転送しようと試みたところ、次のエラーが出た：

   ```
   Failed initializing IPv4 multicast routing API: Protocol not available
   Kernel does not support multicast routing.
   ```

   この Jetson のカーネル（`5.10.104-tegra`）は**コンパイル時に `CONFIG_IP_MROUTE`（マルチキャストルーティングサポート）が有効化されていない**。これはカーネルレベルの機能欠如であり、いかなるユーザー空間ツールでも回避できず、カーネルを再コンパイルするしか解決方法がない——現役で稼働中のロボット搭載コンピューターに対してはリスクが高すぎるため、安易に試すことは推奨しない。
4. さらに、たとえマルチキャストが通ったとしても、現在の NAT（`MASQUERADE`）方式自体が DDS と相性が悪いことも判明した。DDS プロトコルは Discovery フェーズの payload 内に**参加者自身の実アドレスを埋め込み**、以降のユニキャストデータ交換に使用する。しかし NAT はパケットヘッダーの送信元アドレスだけを書き換え、payload の中身までは変更しない。そのためロボット側が Discovery パケットを受信できたとしても、後で「payload に記録されたアドレス」に直接接続し返そうとした際に、そのアドレスが実際とは異なるため接続できない。

### 7.2 結論

**現状の WiFi ブリッジ方式は、DDS / SDK 関連のスクリプト（`VideoClient`、`SportClient`、ROS2 トピックのセグメント越え subscribe など）を本質的にサポートしていない**。これはカーネルの機能不足と NAT アーキテクチャという二重の制約によるものであり、設定で解決できるものではない。

**DDS 通信を必要とするこの種のスクリプトは、当面のところ LAN ケーブルを接続している場合（`eth0` でロボットネットワークに直結している場合）にのみ正常に動作する**。WiFi ブリッジは現時点では、NoMachine リモートデスクトップ、SSH、インターネット接続、`ping` といった DDS Discovery プロトコルに依存しない用途にのみ適用できる。

今後根本的に解決するのであれば、以下のような方向性が考えられる（いずれもコストが大きく、未実施）：

- Jetson のカーネルを再コンパイルして `CONFIG_IP_MROUTE` を有効化し、本物のマルチキャストルーティングデーモンと組み合わせる
- DDS（CycloneDDS）の設定を純粋なユニキャスト Peer モード（マルチキャスト Discovery をスキップする方式）に変更する。ただしロボット本体とクライアント両側の DDS 設定を同時に変更する必要があり、しかもロボット本体（`192.168.123.161`）は現在 SSH でログインできない（ポート接続拒否）ため、この変更を行うことができない

---

## 8. トラブルシューティング：再起動後、go2 ホットスポットには接続できるが WAN にアクセスできない

### 8.1 現象

Jetson を再起動すると、スマートフォンや PC は `go2` ホットスポットに正常に接続でき、SSH / NoMachine で Jetson に入ることもできるが、Jetson 自身は外部ネットワークに出られない（`ping 8.8.8.8` が通らない、あるいは通ってもウェブページが開けない）状態になり、`~/network_fix.sh` を手動で再実行しないと復旧しない。

**根本原因**（調査過程は 8.2 を参照）：起動時の systemd タイミング競合により、`network-fix.service` が USB WiFi アダプターのドライバより先に実行されてしまうこと。8.3 で修正済み（`network_fix.sh` にポーリングリトライを追加 + systemd にデバイス依存を追加）、8.4 に検証結果を記載している。8.3 の設定を適用してもなお再現する場合は、この原因ではないということなので、改めて調査が必要である。

### 8.2 調査

`journalctl -u network-fix.service -b` を確認すると、サービスは起動後かなり早い段階で実行を終えているが、途中で 2 つのエラーが出ていた：

```
Error: Connection activation failed: No suitable device found for this connection ...
Cannot find device "wlan0"
```

併せて `journalctl -b | grep wlan0` を確認したところ、USB WiFi アダプターのドライバ `88x2bu`（DKMS でコンパイル）がカーネルに登録されてから、`wlan0` デバイスが実際に使用可能になる（AP が立ち上がり IP を取得する）まで、十数秒の遅延があることがわかった。一方 `network-fix.service` の起動条件は `After=NetworkManager.service network-online.target` のみであり——これは NetworkManager 自体が起動したことを保証するだけで、DKMS 経由で組み込まれるこの USB アダプターの列挙が完了し `wlan0` デバイスが既に存在していることまでは保証しない。

つまり、スクリプトがアダプターのドライバより先に走ってしまい、`wlan0` に依存するステップ（`nmcli connection up Hotspot`、`ip route ... dev wlan0`）を実行する時点でデバイスがまだ存在せず、そのままエラー終了していたということである。

**なぜホットスポットは「起動時に自動的に有効化されている」ように見えたのか？** それは `Hotspot` 接続自体に `autoconnect=yes` + 最高優先度（4.2 節参照）が設定されており、NetworkManager が `wlan0` デバイスが実際に準備できた後、独自にホットスポットを立ち上げていたからである——これは `network-fix.service` とはまったく別の経路であり、片方は成功し片方は失敗する。そのため「ホットスポットはあるがインターネットには出られない」という状態として現れていた。

### 8.3 修正

2 箇所の変更：

**(1) `~/network_fix.sh` の `wlan0` に依存するステップにポーリングリトライを追加する**（1 回失敗したら終わり、ではなくする）：

```bash
echo "Waiting for wlan0..."
for i in $(seq 1 60); do
    ip link show wlan0 &>/dev/null && break
    sleep 1
done

echo "Bringing up Hotspot..."
for i in $(seq 1 30); do
    nmcli connection up Hotspot && break
    sleep 2
done

# ...DNS設定...

echo "Setting default route via wlan0..."
for i in $(seq 1 30); do
    sudo ip route replace default via 192.168.124.223 dev wlan0 metric 500 && break
    sleep 2
done
```

**(2) systemd サービスにデバイス依存を 1 層追加し、二重の保険とする**：

```bash
sudo tee /etc/systemd/system/network-fix.service << 'EOF'
[Unit]
Description=Go2 Jetson network fix (static eth0 + go2 AP + wifi internet bridge)
After=NetworkManager.service network-online.target sys-subsystem-net-devices-wlan0.device
Wants=network-online.target
Requires=sys-subsystem-net-devices-wlan0.device

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/home/unitree/network_fix.sh
TimeoutStartSec=300
User=root

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl restart network-fix.service
```

`sys-subsystem-net-devices-wlan0.device` は、systemd が udev のネットワークデバイスごとに自動生成するユニットである。`After`/`Requires` を追加することで、サービスはこのデバイスノードが実際に出現するまで起動を待つようになる——ただし、USB アダプターが「デバイスノードが出現する」段階から「AP が実際に有効化を完了する（wpa_supplicant が立ち上がり IP を取得する）」段階まではさらに数秒かかるため、この systemd 依存はあくまで待機ウィンドウを縮めるだけであり、スクリプト内部のポーリングリトライこそが本当の意味でのフォールバックとなる。また `TimeoutStartSec` をデフォルトの 90 秒から 300 秒に引き上げ、リトライループがデフォルトのタイムアウトより長く走って systemd に強制終了されることを防いでいる。

### 8.4 検証

修正後に再起動すると、`journalctl -u network-fix.service -b` でスクリプト自身が出力する待機ログを確認できる：

```
Waiting for wlan0...
Bringing up Hotspot...
Connection successfully activated ...
Setting default route via wlan0...
```

一連の処理は起動後 20 秒程度で自動的に完了し、`ip route` を見ると `default via 192.168.124.223 dev wlan0 metric 500` が既に設定されていることがわかる。しかもこのタイミングは、人が WiFi に再接続して NoMachine を開くタイミングよりも早い——これにより、今回は本当に自動で有効化されており、もはやスクリプトを手動実行する必要がないことが確認できた。

**残っている小さな尾**：`go2` ホットスポットがブロードキャストされ始めるタイミングは、スクリプト内で DNS を設定するステップ（`resolvectl dns eth0 ...`）の完了より早い。起動後 1〜2 分以内にすぐブラウザを開くと、まれに「IP への `ping` は通るがドメイン名の解決ができない」という短い時間帯に遭遇することがある。スクリプトの残りのステップが完了すれば（通常数十秒以内）自然に解消するため、新たな問題ではなく、同じタイミング競合の余波であり、現時点では追加対応の必要はないと判断している。

---

## 9. 現在のネットワーク構成とデータフローの詳細

第 3 節・第 4 節の設計を踏まえ、Jetson 上で実際に有効になっているルーティング + 転送 + NAT 設定を、3 つの具体的なデータフローに落とし込んで整理する。今後トラブルシューティングを行う際の照合用である。

### 9.1 トポロジー

```
                 ロボット本体ネットワーク                    go2 WiFiセグメント
              192.168.123.0/24                        192.168.124.0/24

 ロボットメインコントローラー─┐                              ┌──── 外部PC（WiFiクライアント）
  192.168.123.161            │                              │    192.168.124.223
  （スイッチ同一セグメント）      │                              │    （実際のWAN出口）
                             │                              │
                          eth0（有線）                  wlan0（USB WiFi、APモード）
                    192.168.123.18/24                  192.168.124.1/24
                             │                              │
                             └──────────── Jetson ────────────┘
                                カーネルルーティング + iptables転送/NAT
```

2 枚のネットワークカードは物理的に隔離された 2 つのセグメント（有線 vs 電波）であり、Jetson は**ルーティング + NAT** によってそれらを繋いでいる。二層ブリッジではない（ブリッジ方式は 3.2 節で説明した通り、ハマった末に断念している）。

### 9.2 データフロー1：外部PC → SSH / NoMachineでJetson（192.168.124.1）へ

同一セグメント内（どちらも `124.0/24`）なので直接到達可能であり、転送は不要。冒頭の「目的1」に対応する。

### 9.3 データフロー2：外部PC → ロボットメインコントローラー（192.168.123.161）へのアクセス

```
PCがパケットを送信、dst=192.168.123.161、ゲートウェイは124.1（Jetson）を指す
  → Jetsonの wlan0 に到達
  → ルート 192.168.123.0/24 dev eth0 にヒット（Jetson自身もこのセグメントに属している）
  → iptables FORWARDチェーン：wlan0→eth0 に明示的なACCEPTがある
    （Unitreeのカスタムシステムでは FORWARD チェーンのポリシーがDROPであり、4.3節で追加したこの2本のACCEPTルールだけで転送が成立している）
  → iptables NAT POSTROUTING：-o eth0 MASQUERADE により、送信元アドレスを192.168.124.223からJetson自身の192.168.123.18に書き換える
    （書き換えが必須。ロボットメインコントローラーは124.0/24という見知らぬセグメントをまったく認識しておらず、Jetson自身から来たパケットしか理解できないため）
  → ロボットが192.168.123.18宛てに応答パケットを返す。Jetsonはconntrackの記録によって自動的にアドレスを元に戻し、wlan0経由でPCに転送する
```

### 9.4 データフロー3：Jetson自身のインターネット接続（4.4節の予備デフォルトルートに対応）

```
Jetsonがルーティングテーブルを参照すると、defaultルートが2本ある：
  default via 192.168.124.223 dev wlan0 metric 500    ← 優先度が高い（metricが小さいほど優先される）
  default via 192.168.123.1  dev eth0  metric 20100    ← ほぼ形だけのもので、192.168.123.1へは実際にはARPが通らない

  → wlan0経由となり、次ホップは192.168.124.223（外部PC）へ送られる
  → このホップではJetsonはNATを行わない（POSTROUTINGのMASQUERADEルールは -o eth0 にのみ適用され、wlan0から出るパケットのヘッダーは変更されない）
  → パケットがPCに到達した後、PC自身がip_forward + MASQUERADE（-o はPCの実際のネットワークポート、5.2節参照）を行い、PCのパブリックアドレスに変換して送出する
  → 応答パケットは同じ経路を逆にたどり、PCのNATで元のアドレスに戻され、wlan0経由でJetsonに転送されて戻ってくる
```

**重要なポイント：本当にパブリックネットワークに接続するための NAT は外部 PC 側で行われており、Jetson ではない。** Jetson は wlan0 側のこの経路については、単純にパケットを転送するだけでヘッダーは変更しない。Jetson 自身の MASQUERADE ルールはデータフロー2（ロボット宛てのトラフィックの転送）にのみ使われている。

### 9.5 調査用のコマンド集

```bash
# どちらのネットワークカードに何が接続されているかを確認
ip neigh show dev wlan0
ip neigh show dev eth0

# 現在のデフォルトルートがどちらを使っているか確認（metricが小さい方が優先）
ip route

# 転送ルールがまだ残っているか確認（再起動やシステムアップデートでiptablesルールがリセットされることがある）
sudo iptables -L FORWARD -n -v
sudo iptables -t nat -L POSTROUTING -n -v
```

---

*文書作成日：2026年7月7日；2026年7月9日に第8・9節を追記（起動時タイミング競合の落とし穴 + ネットワーク構成の詳解）*
