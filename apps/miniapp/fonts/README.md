小程序端用的字体子集，由 `scripts/subset-fonts.mjs` 生成，要上传到 COS（地址写在 `src/config/fonts.ts`），不打进小程序包。

- `zcool-qingke-huangyou.woff2`：站酷庆科黄油体，标题用，只含页面用到的字（`scripts/fonts/display-text.txt` + 源码里的中文）
- `bricolage-grotesque.woff2`：Bricolage Grotesque，数字用，拉丁字符，字重 500–800

两个字体都是 SIL Open Font License 1.1，来自 github.com/google/fonts。
