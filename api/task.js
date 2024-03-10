const {RunTaskCommandInput} = require('@aws-sdk/client-ecs');

/**
 * creates a new deployment task configuration
 * 
 * @param {string} gitRepositoryUrl 
 * @param {string} projectId
 * @param {string} deploymentId
 * 
 * @returns {RunTaskCommandInput}
 */
function createNewDeploymentConfiguration(gitRepositoryUrl, projectId, deploymentId) {
    return {
        cluster: process.env.AWS_DEPLOYMENT_CLUSTER_ARN,
        taskDefinition: process.env.AWS_DEPLOYMENT_TASK_DEFINITION_ARN,
        launchType: process.env.AWS_DEPLOYMENT_LAUNCH_TYPE,
        count: 1,
        networkConfiguration: {
            awsvpcConfiguration: {
                subnets: process.env.AWS_DEPLOYMENT_VPC_CONFIGURATION_SUBNETS.split(','),
                securityGroups: process.env.AWS_DEPLOYMENT_VPC_CONFIGURATION_SECURITY_GROUPS.split(','),
                assignPublicIp: 'ENABLED'
            }
        },
        overrides: {
            containerOverrides: [
                {
                    name: process.env.AWS_DEPLOYMENT_TASK_DEFINITION_IMAGE_NAME,
                    environment: [
                        {
                            name: "GIT_REPOSITORY_URL",
                            value: gitRepositoryUrl
                        },
                        {
                            name: "PROJECT_ID",
                            value: projectId
                        },
                        {
                            name: "DEPLOYMENT_ID",
                            value: deploymentId
                        },
                        {
                            name: 'KAFKA_BROKER',
                            value: process.env.KAFKA_BROKER
                        },
                        {
                            name: 'KAFKA_SASL_USERNAME',
                            value: process.env.KAFKA_SASL_USERNAME
                        },
                        {
                            name: 'KAFKA_SASL_PASSWORD',
                            value: process.env.KAFKA_SASL_PASSWORD
                        },
                        {
                            name: 'KAFKA_LOG_TOPIC',
                            value: process.env.KAFKA_LOG_TOPIC
                        }
                    ]
                }
            ]
        }
    };
}

module.exports = { createNewDeploymentConfiguration };