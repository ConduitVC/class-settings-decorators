# class-setting-decorators

NOTE: Typescript is the only supported language at this time.

This module allows classes to declare where they should pull their
starting values from.

This module is intended to be used as a "configuration" tool. Today it can pull data from environment variables.

## Example

```ts
import assert from 'assert';
import {
  env,
  parse,
  nested,
  overwrite,
  SettingFactory,
  Settings,
} from 'class-setting-decorators'

class OnConfig {
  // ...
}

class NestedConfig extends Settings {
  @env('EMAIL')
  email: string;
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

  // Allow for a nested object. Note unlike other decorators this cannot be used
  // in conjunction with any other decorators.
  @nested()
  public communications: NestedConfig;
}

class Overwrite extends TestClass {
  @overwrite()
  public bar: string = 'test';
}

process.env.BAR = 'here';

const factory = new SettingFactory();
const test = factory.create(TestClass);
const overwrite = factory.create(TestClass);

assert(test.result.bar === 'here');

// Decorators are cleared in the subclass. Useful for testing.
assert(overwrite.result.bar === 'test');
```

### Note on subclassings

Values will _not_ be fully resolved in `constructor` . Getters are the preferred way to use this module but if you really need constructor like logic add a `onBuild` method which will have all values fully resolved.