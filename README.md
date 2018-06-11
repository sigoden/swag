# Dee - 框架

## 优点

- 设计驱动开发，逻辑尽可能采用描述性文档表达。
- 使用 swagger 注册路由，解析并校验请求，提高开发效率。
- 更具描述实例化服务。
- 路由函数同时支持 callback/promsie。

## 入门

index.js
``` js
Dee({
  config: {
    name: 'MyApp',
    host: 'localhost',
    port: 3000,
    // 是否是生产环境
    prod: false
  },
  swaggerize: {
    // swagger 文件路径，格式可以是 yaml 或 json
    swaggerFile: path.resolve(__dirname, './swagger.yaml'),
    // 控制器函数，是一个对象，其每个属性对应一个接口操作。
    handlers: require('./handlers'),
    // 安全控制函数，是一个对象，其每个属性对应一个安全验证操作。
    security: require('./security'),
    // 处理解析出的 Route 对象
    routeIteratee: function(route) {
        return route;
    },
    // 默认处理器函数, 找不到接口处理器函数时使用
    defaultHandler: function(req, res, next) {

    },
  },
  // 在路由控制函数之前的中间件，可以是一个函数，传入一个 app 用于注册中间件。也可以是一个中间件函数组成的数组。
  beforeRoute: funtion(app) {
    app.use(funtion(req, res, next) {
      next();
    });
  },
  // 在路由控制函数之后的中间件，可以是一个函数，传入一个 app 用于注册中间件。也可以是一个中间件函数组成的数组。
  afterRoute: [
    funtion(req, res, next) {
      next();
    }
  ],
  // 错误处理函数
  errorHandler: funtion(err, req, res, next) {

  },
  // 所有服务注册成功后调用该函数
  ready: funtion(dee) {

  },
  // 配置外部服务
  services: {
    redis: {
      constructor: 'redis',
    },
    mongoose: {
      constructor: 'mongoose',
      construtorArgs: {
        uri: 'mongodb://localhost/test'
      }
    },
    sequelize: {
      constructor: 'sequelize',
      construtorArgs: {
        database: 'test',
        username: 'root',
        password: 'mysql',
        options: {
          dialect: 'mysql',
          operatorsAliases: false
        }
      }
    },
  }
}, funtion (err, dee) {
  if (err) throw err;
  dee.start();
});
```

swagger.yaml
```yaml
swagger: "2.0"
info:
  version: "0.0.1"
  title: Hello World App
host: localhost:3000
basePath: /
schemes:
  - http
  - https
consumes:
  - application/json
produces:
  - application/json
paths:
  /hello:
    get:
      description: Returns 'Hello' to the caller
      operationId: hello
      parameters:
        - name: name
          in: query
          description: The name of the person to whom to say hello
          required: false
          type: string
      responses:
        "200":
          description: Success
          schema:
            $ref: "#/definitions/HelloWorldResponse"
definitions:
  HelloWorldResponse:
    required:
      - message
    properties:
      message:
        type: string
```

controllers.js
```js
funtion hello(req, res, next) {
  req.swagger.params
  req.srvs
  res.end('')
}
// async

async funtion hello(req, res, next) {
  return new Promise(funtion(resolve, reject) {
    req.swagger.params
    req.srvs
    res.end('')
    resolve(next());
  });
}
```

cli
```
node index.js
```

## services

- redis
- mongoos
- sequelize 
- logger

## test

测试核心
```
npm test
```

测试服务
```
npm run test:srvs
```
