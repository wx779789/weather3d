/* 城市数据：id / 名称 / 省份 / 中国天气网城市代码 / 地标类型 / 地标名 / 主色 */
window.CITIES = [
  { id: 'beijing',   name: '北京',   province: '北京市',     code: '101010100', type: 'gate',    landmark: '天安门',       accent: '#f2c078', lat: 39.90, lng: 116.40 },
  { id: 'shanghai',  name: '上海',   province: '上海市',     code: '101020100', type: 'tvTower', landmark: '东方明珠',     accent: '#ff6f9c', lat: 31.23, lng: 121.47 },
  { id: 'guangzhou', name: '广州',   province: '广东省',     code: '101280101', type: 'tvTower', landmark: '广州塔',       accent: '#6fe0ff', lat: 23.13, lng: 113.26 },
  { id: 'shenzhen',  name: '深圳',   province: '广东省',     code: '101280601', type: 'skyline', landmark: '平安金融中心', accent: '#7aa8ff', lat: 22.54, lng: 114.06 },
  { id: 'chengdu',   name: '成都',   province: '四川省',     code: '101270101', type: 'tower',   landmark: '锦绣天府塔',   accent: '#ffb36b', lat: 30.66, lng: 104.06 },
  { id: 'xian',      name: '西安',   province: '陕西省',     code: '101110101', type: 'pagoda',  landmark: '大雁塔',       accent: '#e2b07a', lat: 34.34, lng: 108.94 },
  { id: 'hangzhou',  name: '杭州',   province: '浙江省',     code: '101210101', type: 'pagoda',  landmark: '雷峰塔',       accent: '#8fe3c4', lat: 30.27, lng: 120.15 },
  { id: 'chongqing', name: '重庆',   province: '重庆市',     code: '101040100', type: 'stilt',   landmark: '洪崖洞',       accent: '#ff8f5e', lat: 29.56, lng: 106.55 },
  { id: 'wuhan',     name: '武汉',   province: '湖北省',     code: '101200101', type: 'pagoda',  landmark: '黄鹤楼',       accent: '#ffd166', lat: 30.59, lng: 114.30 },
  { id: 'haerbin',   name: '哈尔滨', province: '黑龙江省',   code: '101050101', type: 'dome',    landmark: '圣索菲亚教堂', accent: '#a9c8ff', lat: 45.80, lng: 126.53 },
  { id: 'lasa',      name: '拉萨',   province: '西藏自治区', code: '101140101', type: 'palace',  landmark: '布达拉宫',     accent: '#f4d9a6', lat: 29.65, lng: 91.14 },
  { id: 'tianjin',   name: '天津',   province: '天津市',     code: '101030100', type: 'ferris',  landmark: '天津之眼',     accent: '#b49dff', lat: 39.13, lng: 117.20 },
  { id: 'nanjing',   name: '南京',   province: '江苏省',     code: '101190101', type: 'gate',    landmark: '夫子庙',       accent: '#c9b6ff', lat: 32.06, lng: 118.80 },
  { id: 'changsha',  name: '长沙',   province: '湖南省',     code: '101250101', type: 'skyline', landmark: '国金中心',     accent: '#ff9f76', lat: 28.23, lng: 112.94 },
  { id: 'shaoxing',  name: '绍兴',   province: '浙江省',     code: '101210501', type: 'bridge',  landmark: '八字桥',       accent: '#9fe0d0', lat: 30.00, lng: 120.58 },
  { id: 'xiamen',    name: '厦门',   province: '福建省',     code: '101230201', type: 'twin',    landmark: '海峡世茂双子塔', accent: '#7fd8ff', lat: 24.48, lng: 118.09 },
  { id: 'putian',    name: '莆田',   province: '福建省',     code: '101230401', type: 'pagoda',  landmark: '广化寺塔',     accent: '#f0c987', lat: 25.45, lng: 119.01 },
  { id: 'lanzhou',   name: '兰州',   province: '甘肃省',     code: '101160101', type: 'bridge',  landmark: '中山桥',       accent: '#9ad0ff', lat: 36.06, lng: 103.83 }
];

window.cityById = function (id) {
  return window.CITIES.find(function (c) { return c.id === id; }) || window.CITIES[0];
};
