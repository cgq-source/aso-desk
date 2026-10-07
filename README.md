# ASO Desk

个人多 App ASO 工作台。静态网站部署在 GitHub Pages，公开 Apple 数据由浏览器实时查询及 GitHub Actions 采集。选词、隐藏关键词字段、商店草稿、报表与实验日志保存在当前浏览器。

## 使用

1. 添加 App ID、App Store 链接或应用名称，选择国家 / 地区。
2. 在数据设置中校准产品类型、功能词和公开副标题。Lookup API 不返回副标题，因此需要手动导入。
3. 添加候选，执行查询，核对搜索意图与头部 App；需要持续观察的词点星标。
4. 加入真正的同类竞品，查看公开标题 / 已导入副标题的覆盖矩阵。
5. 在文案工作室组织标题、副标题和隐藏关键词，检查容量、重复与词形。规则候选需要人工校准，不是模型生成。
6. 记录拟发布版本、日期和假设；之后对照位置历史及自己的转化报表。
7. 导出 JSON 工作台备份。清理浏览器、换设备或换域名前先备份；本站没有账户云同步。

## 实际功能

- 多 App / 18 个国家或地区，工作资料按 App 和地区隔离。
- 公开 Search / Lookup 查询、6 小时内存缓存、同一请求合并、约 4 秒节流、失败最多一次 JSONP 回退。
- 关键词候选、相关性依据、收藏、过滤、序位 / 热度排序、CSV 导入导出和原始来源。
- 头部结果、公开竞品、标题词形覆盖和可解释的竞争代理指标。
- 商店草稿自动保存、9 种语言工作区、字符与 UTF-8 字节计数、重复 / 超限检查、复制和导出。
- 本地实验日志、文案快照与恢复。
- 同来源每日位置历史；未出现 / 错误不补为 0，只有一个日期时不画虚构曲线。
- 全部应用免费榜和游戏免费榜、文字评论、公开评分信息。
- 用户导入搜索热度 CSV、同口径周 / 月趋势比较、标准化曝光 / 页面访问 / 下载报表。
- 响应式桌面 / 平板 / 手机布局。

## 数据边界

API 结果序位可能与设备内 App Store 不同。每次查询最多返回 200 个应用；未找到只表示本次返回范围里没有目标 App。返回条数不是全商店结果总量。

热度是来自用户提供报表的相对指标（1–100），不是搜索次数。未导入时显示未知。当前没有绑定 Apple Ads、App Store Connect 或模型密钥。页面也没有私钥输入框；实时授权服务应另接受保护的后端。

竞争代理 `proxy-v1` = 40% 头部标题词形匹配 + 40% 评分数量对数代理 + 20% 同分类比例。它不代表官方竞争度、下载量、收益或真实竞争难度，建议仅用作解释线索。

竞品隐藏关键词无法公开获取。交叉本地化的地区索引组合未被当前数据验证，不作为 Apple 保证。本站不会自动修改商店资料或提交应用审核。

公开 API 并不等于获得开源许可的全量数据集。图标用于展示对应的 App Store 应用，并附其商店链接。代码没有调用 ASO Scout 后端、复制其数据集或复刻其评分公式。

## 导入格式

热度 CSV 支持列名：

```csv
searchTerm,countryOrRegion,searchPopularity1to100,month
```

也支持 keyword / popularity / country / week 等常见同义列。无效行在导入前预览中单独列出，不用缺失值填充热度。

转化报表使用标准化宽表：

```csv
date,impressions,pageViews,downloads
```

导入转化报表会替换当前 App / 地区的本地报表；应先按一致的日期和渠道整理。比值只有在口径一致时才有比较意义。

## 本地开发与测试

无需安装前端依赖：

```sh
python3 -m http.server 8768 --bind 127.0.0.1
node --test tests/*.test.mjs
```

通过 `http://127.0.0.1:8768/` 访问。直接双击 HTML 不支持 ES 模块与数据加载。

## GitHub Actions

- `pages.yml`：测试、打包并部署 Pages，静态包不含脚本、测试或本机工作资料。
- `collect.yml`：每天约 08:17 北京时间请求已配置的公共数据；GitHub 的调度可能延迟。也可手动运行。采集器最多重试一次，搜索源失败后停止该批次，保留上一次成功数据。
- `data/collection-config.json`：公开采集 App / 地区 / 关键词配置。默认只有 Fruitlight Doku 的公开产品词。浏览器里新增的私人关注词不会自动写入这个文件。
- 采集历史保留最近 365 个日期。发布失败不等于数据成功上线，以 Pages 工作流结论为准。

## 官方资料

- [Apple Search API](https://performance-partners.apple.com/search-api)
- [App Store 搜索与关键词建议](https://developer.apple.com/app-store/search/)
- [Apple Ads 热度接口](https://developer.apple.com/documentation/apple-ads-platform-api/insights-endpoints)
- [Apple 分析报表](https://developer.apple.com/documentation/analytics-reports)
- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
