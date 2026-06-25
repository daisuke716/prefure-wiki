# Unitree Go2 拡張ドックのアップグレード：Orin Nano 8G → Orin NX 16G

## 2種類の拡張ドック

Unitree Go2の拡張ドックには、搭載するNVIDIA Jetson Orinモジュールの違いによって2つの構成があります：

|              | **Jetson Orin Nano 8GB**  | **Jetson Orin NX 16GB** |
| ------------ | ------------------------- | ----------------------- |
| AI演算性能   | 40 TOPS                   | 100 TOPS                |
| メモリ       | 8 GB                      | 16 GB                   |
| CPU          | 6コア Arm Cortex-A78AE    | 8コア Arm Cortex-A78AE  |
| 最大消費電力 | 15W                       | 25W                     |

NX 16GはNano 8Gと比べてAI推論性能が**2.5倍**向上しており、ロボット上でより複雑な認識・制御モデルを実行するのに適しています。本記事では、Nano 8GモジュールをNX 16Gモジュールに交換する手順を記録します。

Nano 8G上での開発作業（環境構築・依存関係のインストール・カスタムコードなど）が相当量蓄積されているため、NX 16G上でゼロからシステムを再インストールしたくない場合を想定しています。本記事の基本方針は：**元のNano 8GのSSDとシステムをそのまま保持し、NX 16GのQSPI firmwareのダウングレードと少数の設定ファイルの変更のみで、既存のシステムがNX 16Gのハードウェアを正しく動作させられるようにする**ことです。

---

## なぜそのまま差し替えできないのか

新品のJetson Orin NX 16Gモジュールには出荷時から**JetPack 6.2**（NVIDIA Jetson Linux 36.4.3）がインストールされていますが、Unitreeの出荷時拡張ドックのシステムは**JetPack 5.1.1**（NVIDIA Jetson Linux 35.3.1）で動作しています。

|                        | JetPackバージョン | Jetson Linuxバージョン |
| ---------------------- | ----------------- | ---------------------- |
| Unitree出荷時SSD       | JetPack 5.1.1     | 35.3.1                 |
| 新規購入NX 16Gモジュール | JetPack 6.2     | 36.4.3                 |

JetPack 5.xから6.xへのアップグレードはメジャーバージョンの大きな跳躍であり、カーネルバージョン・ドライバスタック・BSP構造などの低レベルな変更が伴います。さらに重要なのは、**JetsonモジュールにはQSPI-NOR Flashが独立して搭載されており**、そこに格納されているQSPI firmware（Bootloader / MB2 / CBoot等のコンポーネント）のバージョンが、実行するJetson Linuxのバージョンと一致している必要があるということです。

NVIDIAの公式ドキュメントでは、Jetson Linux 35.x（JetPack 5.x）とJetson Linux 36.x（JetPack 6.x）のQSPI firmwareは互換性がないと明記されています。QSPI firmwareのバージョンとSSD上のOSバージョンが一致しない場合、ブートチェーンが正しくハンドシェイクできず、Jetsonは**ブートループ**に陥り、システムに入れなくなります。

> 参考：[Flashing Support — NVIDIA Jetson Linux 36.4.4 Developer Guide](https://docs.nvidia.com/jetson/archives/r36.4.4/DeveloperGuide/SD/FlashingSupport.html)（Updating Jetson Orin Nano Devkit from JetPack 5 to JetPack 6）
>
> 原文："The halt is because of a mismatch between the bootloader in the QSPI and the file system in the SD card. The bootloader version is JetPack 6, and the file system is JetPack 5. JetPack 6 bootloader does not support the JetPack 5 file system."

### なぜダウングレードするのか？アップグレードではなく

バージョンの非互換性が根本的な問題であれば、逆方向に考えることも自然です。SSD上のOSをJetPack 6.xにアップグレードして、NX 16Gモジュールの出荷時QSPI firmwareに合わせることはできないのでしょうか？

理論上、NX 16GとJetPack 6.2を組み合わせれば**MAXN SUPERモード**が有効になり、AI演算性能は**157 TOPS**に達します。さらにNano 8GでもJetPack 6.2にアップグレードすれば**67 TOPS**を達成できます。しかし、Go2ではこれは現実的ではありません。**Go2の放熱設計と電源設計はJetPack 5.1.1の消費電力範囲を前提に設計されており**、高い性能モードで動作させると深刻な発熱と電流過負荷が発生し、ハードウェアを損傷するリスクがあります。

さらに、Unitreeは現在Go2向けに**JetPack 5.1.1**ベースの出荷時システムイメージのみを提供しており、JetPack 6.xの公式対応版は存在しません。

したがって、正しいアプローチはNX 16GモジュールのQSPI firmwareをJetPack 5.1.1に合わせた版へ**ダウングレード**することであり、OSをアップグレードすることではありません。

---

## 解決策

### 第1ステップ：NX 16GモジュールのQSPI Firmwareをダウングレード

NX 16GモジュールをUnitree Expansion Dockに差し込む前に、QSPI firmwareをダウングレードする必要があります。

#### 必要なハードウェア

- **Jetson Carrier Board**（NX 16GをForce Recoveryフラッシュモードにするため）
- USB Type-CまたはMicro-USBケーブル（carrier boardの型番による）
- Ubuntuが動作するLinuxホストマシン

#### QSPI Firmwareのフラッシュ手順

1. NX 16GモジュールをJetson Carrier Boardに取り付ける（**この時点ではUnitree SSDは挿入しない**）
2. Carrier Boardの説明書に従い**Force Recoveryモード**に入る（通常はRecoveryボタンを押しながら電源を入れる）
3. Linuxホストに **[NVIDIA Jetson Linux 35.3.1 Driver Package (BSP)](https://developer.nvidia.com/embedded/jetson-linux-r3531)** をダウンロードする
4. QSPIのみをフラッシュし、rootfsはフラッシュしない（Sample Root Filesystemのダウンロードは不要）

QSPI専用フラッシュの具体的なコマンドは以下のガイドを参照してください（JetPack 6のダウングレードを例にしていますが、手順は同じで、対応するBSPバージョンに置き換えるだけです）：

> 参考：[GR00T JetPack フラッシュガイド](https://nvlabs.github.io/GR00T-WholeBodyControl/references/jetpack6.html)

フラッシュ時は、使用するcarrier boardの説明書を参照して、Recoveryモードへの入り方とケーブル接続方法を確認してください。

QSPI firmwareのダウングレードが完了したら、NX 16GモジュールをUnitree Expansion Dockに差し込み、元のM.2 SSDを接続します。この時点でシステムは正常に起動できます。**16GBのメモリ**と**8コアのCPU**が認識されますが、モジュールの型番識別と電源管理モードはまだNano 8Gの設定のままです。

---

QSPI firmwareのダウングレードが完了したら、既存の開発環境を保持する必要があるかどうかに応じて、以下の2つの方案から選択してください：

---

### 第2ステップ：NX 16G Linuxシステム環境の構築

#### 方案A：既存システムを保持して設定ファイルを変更する

NX 16GモジュールをUnitree Expansion Dockに差し込み、元のSSDで起動します。システムは起動できますが、カーネルはまだNano 8Gのハードウェア記述をロードしており、電源管理もNano 8Gの設定に制限されています。システムがNX 16Gのハードウェアを正しく認識できるよう、3つのファイルを手動で置き換える必要があります。

**置き換えファイルの取得元**：NX 16GのUnitree出荷時イメージSSDを現在のシステムにマウントし（マウントポイント例：`/media/unitree/7073f027-1f76-471e-8386-b7ac9f58e0e6/`）、そこから直接ファイルをコピーします。

##### 1. 電源管理設定ファイル `nvpmodel.conf` の置き換え

| 項目           | 内容                                                                    |
| -------------- | ----------------------------------------------------------------------- |
| **取得元** | `/media/unitree/7073f027-.../etc/nvpmodel.conf`（NX 16G出荷時SSD）     |
| **書き込み先** | `/etc/nvpmodel.conf`（現在稼働中のシステム）                        |
| **バックアップ** | 元ファイルを `/etc/nvpmodel.conf.nano8g.bak` としてバックアップ    |
| **変更前** | 15W / 7W の2つの電源モードのみ                                          |
| **変更後** | MAXN / 10W / 15W / 25W の4つの電源モードが追加される                    |

```bash
sudo cp /etc/nvpmodel.conf /etc/nvpmodel.conf.nano8g.bak
sudo cp /media/unitree/7073f027-.../etc/nvpmodel.conf /etc/nvpmodel.conf
```

##### 2. デバイスツリーファイル（DTB）の置き換え

カーネルはDTB（Device Tree Blob）を通じてハードウェアを認識します。Nano 8GとNX 16Gは異なるDTBファイルを使用するため、NX 16G出荷時SSDから対応ファイルをコピーして現在のシステムの同名ファイルを上書きします。

| 項目           | 内容                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| **取得元** | `/media/unitree/7073f027-.../boot/dtb/kernel_tegra234-p3767-0000-p3768-0000-a0.dtb`（NX 16G出荷時SSD）       |
| **書き込み先** | `/boot/dtb/kernel_tegra234-p3767-0000-p3768-0000-a0.dtb`（現在のシステム）                               |

```bash
sudo cp /media/unitree/7073f027-.../boot/dtb/kernel_tegra234-p3767-0000-p3768-0000-a0.dtb \
    /boot/dtb/kernel_tegra234-p3767-0000-p3768-0000-a0.dtb
```

##### 3. ブート設定ファイル `extlinux.conf` の変更

`/boot/extlinux/extlinux.conf` の `FDT` 行が、カーネル起動時にどのDTBをロードするかを決定します。Nano 8GとNX 16GのDTBファイル名は数字1箇所のみ異なります：

| 項目           | 内容                                                                              |
| -------------- | --------------------------------------------------------------------------------- |
| **ファイル** | `/boot/extlinux/extlinux.conf`                                                  |
| **バックアップ** | `/boot/extlinux/extlinux.conf.nano8g.bak` としてバックアップ                |
| **変更前** | `FDT /boot/dtb/kernel_tegra234-p3767-0003-p3768-0000-a0.dtb`（Nano 8G）     |
| **変更後** | `FDT /boot/dtb/kernel_tegra234-p3767-0000-p3768-0000-a0.dtb`（NX 16G）      |

```bash
sudo cp /boot/extlinux/extlinux.conf /boot/extlinux/extlinux.conf.nano8g.bak
sudo sed -i 's/p3767-0003-p3768/p3767-0000-p3768/g' /boot/extlinux/extlinux.conf
```

変更後、ファイル内の `FDT` 行が `p3767-0000` バージョンのDTBを指していることを確認してください。

3つのステップ完了後、再起動します：

```bash
sudo reboot
```

再起動後、カーネルはNX 16Gのハードウェア記述をロードします。システムプラットフォームは**Orin NX**として正しく認識され、電源管理で25WとMaxNモードが解放され、EMC（メモリコントローラー）関連のエラーも解消されます。

以下のコマンドで確認できます：

```bash
# モジュールモデルを確認
cat /proc/device-tree/model

# 利用可能な電源モードを確認
sudo nvpmodel -q
```

---

#### 方案B：Unitree公式NXイメージをクリーンインストールする

既存の開発環境を保持する必要がなく、クリーンな出荷時システムを使用したい場合は、**M.2リーダーを使用してUnitree公式のNX 16Gイメージファイルを直接M.2 SSDに書き込む**ことができ、上記の設定ファイル変更手順を省略できます。

##### 必要なもの

- **M.2 NVMeリーダー**（USB-M.2変換アダプター）
- Linuxが動作するPC
- Unitree公式のNX 16Gシステムイメージ：`go2_nx_Jetpack5.1.1_20250930.img.bz2`（[Unitreeモジュールアップグレード公式ドキュメント](https://support.unitree.com/home/en/developer/module_update)からダウンロードリンクを取得、Google Drive）

##### 手順

1. イメージファイルを解凍する：

```bash
bzip2 -d go2_nx_Jetpack5.1.1_20250930.img.bz2
```

2. M.2リーダーでSSDをPCに接続し、デバイスパスを確認する：

```bash
lsblk
```

3. イメージを書き込む（`/dev/nvmeXn1` を実際のデバイスパスに置き換える — **実行前にデバイスパスを必ず確認すること**）：

```bash
sudo dd if=go2_nx_Jetpack5.1.1_20250930.img \
    of=/dev/nvmeXn1 \
    bs=64M \
    status=progress \
    oflag=direct
```

4. 書き込み完了後、SSDを拡張ドックに戻し、QSPI firmwareのダウングレードが完了したNX 16Gモジュールを差し込めば、そのまま起動できます

---

## 参考資料

- [Unitreeモジュールアップグレード公式ドキュメント](https://support.unitree.com/home/en/developer/module_update)
- [NVIDIA JetPack Archive](https://developer.nvidia.com/embedded/jetpack-archive)
- [NVIDIA Jetson Linux 35.3.1 Developer Guide](https://docs.nvidia.com/jetson/archives/r35.3.1/DeveloperGuide/index.html)
- [GR00T JetPack フラッシュガイド（QSPI firmwareフラッシュ手順）](https://nvlabs.github.io/GR00T-WholeBodyControl/references/jetpack6.html)
