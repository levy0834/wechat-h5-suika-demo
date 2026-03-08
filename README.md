# wechat-h5-suika-demo

一个类似“合成大西瓜”的微信 H5 静态小游戏 Demo。

## 玩法

- 左右拖动上方准星
- 松手投下水果
- 两个相同水果碰到一起会合成更大的水果
- 水果堆过危险线太久就结束

## 特点

- 纯静态 HTML / CSS / JS
- 无依赖、无构建工具
- 手机触控优先
- 适合微信里直接打开试玩
- 固定步长 + 迭代碰撞求解 + 睡眠机制，堆叠更稳、抖动更少
- 本地 `assets/fruits/*.svg` 水果插画资源，离线可用、无外链

## 本地运行

直接打开 `index.html` 即可。

或：

```bash
python3 -m http.server 8080
```

然后访问 `http://localhost:8080`

## 部署

包含 GitHub Pages 工作流 `.github/workflows/deploy.yml`。
推送到 GitHub 后，Pages 选择 **GitHub Actions** 即可自动部署。
