import type { Express } from 'express';
import request from 'supertest';

interface RegisteredAgent {
  agent: ReturnType<typeof request.agent>;
  user: {
    _id: string;
    email: string;
    name: string;
  };
}

export async function registerAgent(
  app: Express,
  email: string,
  name: string,
): Promise<RegisteredAgent> {
  const agent = request.agent(app);
  const response = await agent.post('/api/v1/auth/register').send({
    email,
    password: 'correct horse battery staple',
    name,
  });

  if (response.status !== 201) {
    throw new Error(`Register failed: ${response.status} ${JSON.stringify(response.body)}`);
  }

  return {
    agent,
    user: response.body.data as RegisteredAgent['user'],
  };
}
