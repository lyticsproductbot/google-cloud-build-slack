const IncomingWebhook = require('@slack/client').IncomingWebhook;
const humanizeDuration = require('humanize-duration');
const config = require('./config.json');

module.exports.webhook = new IncomingWebhook(config.SLACK_WEBHOOK_URL);
module.exports.status = config.GC_SLACK_STATUS;

// subscribe is the main function called by GCF.
module.exports.subscribe = (event, callback) => {
  const build = module.exports.eventToBuild(event.data.data);

  // Skip if the current status is not in the status list.
  const status = module.exports.status || ['SUCCESS', 'FAILURE', 'INTERNAL_ERROR', 'TIMEOUT'];
  if (status.indexOf(build.status) === -1) {
    return callback();
  }

  // Send message to slack.
  const message = module.exports.createSlackMessage(build);
  module.exports.webhook.send(message, (err, res) => {
    if (err) console.log('Error:', err);
    callback(err);
  });
};

// eventToBuild transforms pubsub event message to a build object.
module.exports.eventToBuild = (data) => {
  return JSON.parse(new Buffer(data, 'base64').toString());
}

const DEFAULT_COLOR = '#4285F4'; // blue
const STATUS_COLOR = {
  'QUEUED': DEFAULT_COLOR,
  'WORKING': DEFAULT_COLOR,
  'SUCCESS': '#34A853', // green
  'FAILURE': '#EA4335', // red
  'TIMEOUT': '#FBBC05', // yellow
  'INTERNAL_ERROR': '#EA4335', // red
};

// createSlackMessage create a message from a build object.
module.exports.createSlackMessage = (build) => {
  let message = {
    text: `Build \`${build.id}\` finished`,
    mrkdwn: true,
    attachments: [
      {
        color: STATUS_COLOR[build.status] || DEFAULT_COLOR,
        title: 'Build logs',
        title_link: build.logUrl,
        fields: [{
          title: 'Status',
          value: build.status
        }, {
          title: 'Duration',
          value: humanizeDuration(new Date(build.finishTime) - new Date(build.startTime))
        }],
        footer: 'Google Cloud Container Builder',
        footer_icon: 'https://ssl.gstatic.com/pantheon/images/containerregistry/container_registry_color.png',
        ts: Math.round(new Date(build.finishTime).getTime()/1000)
      }
    ]
  };

  // Add source information to the message.
  let source = build.source || null;
  if (source) {
    message.attachments[0].fields.push({
      title: 'Repository',
      value: build.source.repoSource.repoName
    });

    message.attachments[0].fields.push({
      title: 'Branch',
      value: build.source.repoSource.branchName
    });
  }

  // Add images to the message.
  let images = build.images || [];
  for (let i = 0, len = images.length; i < len; i++) {
    message.attachments[0].fields.push({
      title: 'Image',
      value: images[i]
    });
  }
  return message
}
