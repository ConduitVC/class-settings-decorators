# class-setting-decorators

NOTE: Typescript is the only supported language at this time.

This module allows classes to declare where they should pull their
starting values from.

This module is intended to be used as a "configuration" tool. Today it can pull data from enviornment variables.

## Example

```ts
import {
  env,
  parse,
  SettingFactory,
  Settings,
} from 'class-setting-decorators'

class OnConfig {
  // ...
}

class TestClass extends Settings {
  // Parse the environment variable into a number.
  // NOTE: default valuse supplied on the class will not be run through parse.
  @parse((value) => parseInt(value, 10))
  // The topmost decorator always will be used if a value is available.
  @env('FOO_OVERRIDE')
  // multiple environment variables can be used.
  @env('FOO')
  public foo: number;

  // defaults work just as expected and will be used when no match is found.
  @env('BAR')
  public bar: string = 'sup';

  // parse the value from the command line into an object.
  @parse((value) => new OnConfig(value))
  @env('_TEST_ON_CONFIG')
  public config?: OnConfig;
}

const factory = new SettingFactory();
const { result, errors } = factory.create(TestClass);
```