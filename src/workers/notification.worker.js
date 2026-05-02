import { getChannel } from '../config/rabbitmq.js';
import { sendEmail } from '../utils/sendEmail.js';
import { sendPushNotification } from '../utils/notification.utils.js';

export const setupWorkers = () => {
    const channel = getChannel();
    if (!channel) {
        console.error('Cannot setup workers: RabbitMQ channel not initialized');
        return;
    }

    // Email Queue Worker
    channel.consume('email_queue', async (msg) => {
        if (msg !== null) {
            try {
                const data = JSON.parse(msg.content.toString());
                console.log(`📩 Processing email task for: ${data.email}`);
                await sendEmail(data);
                channel.ack(msg);
                console.log(`✅ Email sent successfully to: ${data.email}`);
            } catch (error) {
                console.error('❌ Failed to process email task:', error);
                // Optionally NACK the message to requeue it, but for now we'll just ack to avoid infinite loops if the email is invalid
                // channel.nack(msg, false, false); 
                channel.ack(msg); 
            }
        }
    });

    // Push Notification Queue Worker
    channel.consume('push_queue', async (msg) => {
        if (msg !== null) {
            try {
                const data = JSON.parse(msg.content.toString());
                console.log(`🔔 Processing push notification task for: ${data.userId} (${data.userType})`);
                await sendPushNotification(data.userId, data.userType, data.payload);
                channel.ack(msg);
                console.log(`✅ Push notification processed for: ${data.userId}`);
            } catch (error) {
                console.error('❌ Failed to process push notification task:', error);
                channel.ack(msg);
            }
        }
    });

    console.log('👷 RabbitMQ Workers are listening for tasks...');
};
