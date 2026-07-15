<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

Telegram-бот Endora на NestJS: AI-инструменты для генерации изображений, видео, аудио и текста.

## Коды ошибок бота

При сбое генерации пользователю показывается сообщение вида **«❌ Ошибка #N»** с понятным текстом. Номер помогает быстро понять причину при разборе обращений в поддержку.

Источник кодов: [`src/common/services/bot/errors/bot-error.mapper.ts`](src/common/services/bot/errors/bot-error.mapper.ts)

| Код     | Константа             | Что означает                   | Типичные причины                                                                                                   |
| ------- | --------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **#1**  | `UNKNOWN`             | Неизвестная ошибка             | Непредвиденный сбой, сообщение не попало ни в одну категорию                                                       |
| **#2**  | `INSUFFICIENT_TOKENS` | Недостаточно токенов           | Баланс пользователя меньше стоимости генерации. **Отдельное сообщение без «#2»** — см. `insufficientTokens` в i18n |
| **#10** | `CONFIG`              | Проблема конфигурации          | Не задан API-ключ, не настроена модель для инструмента                                                             |
| **#11** | `TIMEOUT`             | Превышено время ожидания       | Генерация или polling задачи заняли слишком долго; «зависшие» async-задачи                                         |
| **#12** | `PROVIDER`            | Сбой провайдера                | Sharpii, Topaz, OpenRouter, ElevenLabs, HeyGen и др.: отказ API, HTTP-ошибки, нехватка кредитов у провайдера       |
| **#13** | `DELIVERY`            | Не удалось доставить результат | Ошибка при отправке готового файла/медиа пользователю в Telegram                                                   |
| **#14** | `POLL`                | Не удалось проверить статус    | Async-задача создана, но polling статуса у провайдера не удался                                                    |

### Примечания

- Если провайдер вернул **уже локализованное** сообщение (например, от Sharpii на русском), пользователь увидит его текст вместе с кодом — без «сырого» stack trace или HTTP-деталей.
- Технические детали (полный `error.message`, stack, `ID запроса`) пишутся в **логи** (pino), а не в чат.
- Тексты для пользователя задаются в [`ru.ts`](src/common/services/bot/i18n/locales/ru.ts) / [`en.ts`](src/common/services/bot/i18n/locales/en.ts) → `aiResult.errorByCode`.

## Project setup

```bash
$ yarn install
```

## Compile and run the project

```bash
# development
$ yarn run start

# watch mode
$ yarn run start:dev

# production mode
$ yarn run start:prod
```

## Run tests

```bash
# unit tests
$ yarn run test

# e2e tests
$ yarn run test:e2e

# test coverage
$ yarn run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ yarn install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
