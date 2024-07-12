import { LogFormatter, LogItem } from '@aws-lambda-powertools/logger';
import { LogAttributes, UnformattedAttributes } from '@aws-lambda-powertools/logger/types';

type LogStashLog = LogAttributes & {
  '@timestamp': string;
};

class LogStashFormatter extends LogFormatter {
  public formatAttributes(attributes: UnformattedAttributes, additionalLogAttributes: LogAttributes): LogItem {
    const baseAttributes: LogStashLog = {
      '@timestamp': this.formatTimestamp(attributes.timestamp),
      '@version': 1,
      level: attributes.logLevel,
      message: attributes.message,
      // service: attributes.serviceName,
      environment: attributes.environment,
      awsRegion: attributes.awsRegion,
      lambdaFunction: {
        name: attributes.lambdaContext?.functionName,
        arn: attributes.lambdaContext?.invokedFunctionArn,
        memoryLimitInMB: attributes.lambdaContext?.memoryLimitInMB,
        version: attributes.lambdaContext?.functionVersion,
        coldStart: attributes.lambdaContext?.coldStart,
      },
    };
    const logItem = new LogItem({ attributes: baseAttributes });
    logItem.addAttributes(additionalLogAttributes); // add any attributes not explicitly defined

    return logItem;
  }
}

export { LogStashFormatter };
