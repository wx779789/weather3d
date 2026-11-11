# 天气数据链路 · weather3d

## 一、三级降级策略

前端 `scene.js` 的 `load()` 按顺序尝试，任一成功即停止：

| 级别 | 来源 | 触发条件 | 面板标注 |
|---|---|---|---|
| 1 | `/api/weather?code=` → 本机 `server.js` 代理中国天气网 | 有 Node 运行时（本地 `node server.js`） | 「实时」 |
| 2 | `https://api.open-meteo.com/v1/forecast` | 级别 1 非 200 或数据不完整（**GitHub Pages 上恒为此级**） | 「Open-Meteo」 |
| 3 | 内置演示数据 | 两级均失败（断网） | 「演示数据」 |

> 结论：**Pages 线上站点永远走 Open-Meteo**。中国天气网那条链路只在本地或自建服务器上生效。

## 二、级别 1：server.js 代理细节

代理存在的意义：绕开浏览器 CORS，并处理 `weather.com.cn` 的 GBK/UTF-8 混合编码。

```
GET /api/weather?code=101010100
```

| 用途 | 上游地址 | 解析方式 |
|---|---|---|
| 实时观测 | `http://d1.weather.com.cn/weather_index/{code}.html` | 提取 `var dataSK =`、`var cityDZ =`、`var fc =` 三块 JSON |
| 24 小时 | `http://www.weather.com.cn/weather1d/{code}.shtml` | 提取 `hour3data=` 的 `1d` 数组，每段 `时间,代码,天气,温度,风向,风力`，取前 8 段 |
| 7 天 | `http://www.weather.com.cn/weather/{code}.shtml` | 正则切 `<li class="sky…">` 块，取 `h1` 日期、`p.wea` 天气、`p.tem` 高低温、风力、`png40 d??/n??` 图标代码 |

实现要点：

- **超时 12 秒**、三个上游 `Promise.all` 并行、单路失败不阻断（各自 `.catch(() => '')`）。
- **编码自适应**：先按 UTF-8 解码，若前 400 字符出现 `U+FFFD` 替换符，则用 `TextDecoder('gbk')` 重解。
- **缓存 5 分钟**（`TTL = 5 * 60 * 1000`），键为城市代码，避免高频打上游。
- 入参清洗：`code` 仅保留数字并截断至 12 位。
- 附加端点：`GET /health` → `{ok:true, ts}`。

## 三、级别 2：Open-Meteo 参数（浏览器直连，支持 CORS）

```
https://api.open-meteo.com/v1/forecast
  ?latitude={lat}&longitude={lng}
  &current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,precipitation
  &hourly=temperature_2m,weather_code,precipitation
  &daily=weather_code,temperature_2m_max,temperature_2m_min
  &timezone=Asia/Shanghai&forecast_days=8
```

字段映射与降级补偿：

- `weather_code`（WMO 标准）经 `wmoText()` 转中文天气文本，再喂给 `modeFromText()`。
- 小时数据按 `now.time` 对齐当前整点，每 3 小时取一档，共 8 档 → 对应「24 小时」面板。
- `daily` 取 7 天，日期标签转为「今天 / 明天 / 后天 / MM日DD」。
- **精度损失**：Open-Meteo 无 AQI，`aqi` 固定为 `--`；风力由 `km/h` 直接展示，与中国天气网「几级」口径不同。

## 四、天气文本 → 场景模式的归一

`modeFromText(text, code, precip)` 输出 8 种模式之一：

| 模式 | 判定关键词 | 场景表现 |
|---|---|---|
| 晴 | 晴 | 高亮天空、强日光、星空（夜间） |
| 多云 | 多云 | 云精灵中等密度、光线柔和 |
| 阴 | 阴 | 云层加厚、整体降饱和 |
| 雨 | 雨（非雷） | 1300 条雨线、地面湿润、水洼 |
| 雷 | 雷 | 雨 + 随机闪电 |
| 雪 | 雪 | 900 雪粒子、地面高粗糙度 |
| 雾 | 雾 | 贴地雾片、能见度压低 |
| 霾 | 霾 / 浮尘 / 沙尘 | 灰黄色调、雾片偏黄 |

**改判定规则时**：必须同时验证 `?wx=` 六个强制值（`rain|snow|cloudy|fog|haze|clear`），确保特效与模式一一对应。
