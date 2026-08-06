#!/usr/bin/env bash
# 完整 E2EE 同步验证：test push → verifycount → test1 pull → verifycount
# 前置条件：Obsidian 已关闭（避免它删除测试文件/后台同步干扰服务器）
#
# 用法：
#   bash test/full-sync-verify.sh
#
# 预期：
#   1. test push 清空服务器（保留 info.json/master key）后 E2EE 重传
#   2. verifycount(test)  本地文件数 == 服务器 item 数，密文为 JED01
#   3. test1 pull 从服务器拉取并解密
#   4. verifycount(test1) 数量一致，内容解密为明文
set -e
cd "$(dirname "$0")/.."

CLI="node cli/sync-cli.cjs"
TEST="/home/wang/文档/test"
TEST1="/home/wang/文档/test1"

echo "=========================================="
echo " 完整 E2EE 同步验证 v0.3.59"
echo "=========================================="

# 0. 预检查：Obsidian 必须关闭
if pgrep -f 'obsidian/app.asar' > /dev/null 2>&1; then
  echo "❌ 检测到 Obsidian 正在运行 — 请先关闭它（它会删除 CLI 测试文件并后台同步干扰）"
  exit 1
fi

# 0b. 确保 test vault 有测试内容（若被 Obsidian 清空则重建）
if [ "$(find "$TEST" -name '*.md' -not -path '*/.obsidian/*' -not -path '*/.noteforge/*' 2>/dev/null | wc -l)" = "0" ]; then
  echo "→ 重建 test vault 测试内容"
  mkdir -p "$TEST/测试目录A/子目录1" "$TEST/测试目录B"
  printf '# 笔记一\nE2EE 验证中文 🚀\n' > "$TEST/测试目录A/子目录1/笔记一.md"
  printf '# 笔记二\nSecond note 12345\n' > "$TEST/测试目录A/笔记二.md"
  printf '# 图片说明\n' > "$TEST/测试目录B/图片说明.md"
  head -c 2048 /dev/urandom > "$TEST/测试目录A/子目录1/sample.bin"
  printf '\x89PNG\r\n\x1a\n' > "$TEST/测试目录A/测试图片.png"
  head -c 300 /dev/urandom >> "$TEST/测试目录A/测试图片.png"
fi

# 1. test force push（清空服务器 + E2EE 加密重传）
echo ""
echo "── 步骤 1/4: test force push（先删服务器再加密重传）──"
$CLI push "$TEST" 2>&1 | grep -vE 'non-json response' || true

# 2. verifycount test
echo ""
echo "── 步骤 2/4: verifycount(test) — 数量 + E2EE 密文校验 ──"
$CLI verifycount "$TEST" 2>&1 | grep -E 'PASS|FAIL|local|remote|==='
VC1=$?

# 3. test1 force pull（从服务器拉取 + 解密）
echo ""
echo "── 步骤 3/4: test1 force pull（拉取 + 解密）──"
$CLI pull "$TEST1" 2>&1 | grep -vE 'non-json response' || true

# 4. verifycount test1
echo ""
echo "── 步骤 4/4: verifycount(test1) — 数量一致性校验 ──"
$CLI verifycount "$TEST1" 2>&1 | grep -E 'PASS|FAIL|local|remote|==='

echo ""
echo "=========================================="
echo " 验证完成 — 检查上方是否有 FAIL"
echo "=========================================="
