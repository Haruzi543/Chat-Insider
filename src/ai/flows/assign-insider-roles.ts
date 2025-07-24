'use server';
/**
 * @fileOverview Randomly assigns roles (Insider, Master, Commons) to players in a room.
 *
 * - assignInsiderRoles - A function that assigns roles to players in the room.
 * - AssignInsiderRolesInput - The input type for the assignInsiderRoles function.
 * - AssignInsiderRolesOutput - The return type for the assignInsiderRoles function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AssignInsiderRolesInputSchema = z.object({
  players: z
    .array(z.string())
    .describe('The list of player nicknames in the room.'),
  roomOwner: z.string().describe('The nickname of the room owner.'),
});
export type AssignInsiderRolesInput = z.infer<typeof AssignInsiderRolesInputSchema>;

const AssignInsiderRolesOutputSchema = z.object({
  roles: z.record(z.string(), z.string()).describe('A map of player nicknames to their assigned roles (Insider, Master, or Common).'),
});
export type AssignInsiderRolesOutput = z.infer<typeof AssignInsiderRolesOutputSchema>;

export async function assignInsiderRoles(input: AssignInsiderRolesInput): Promise<AssignInsiderRolesOutput> {
  return assignInsiderRolesFlow(input);
}

const assignInsiderRolesFlow = ai.defineFlow(
  {
    name: 'assignInsiderRolesFlow',
    inputSchema: AssignInsiderRolesInputSchema,
    outputSchema: AssignInsiderRolesOutputSchema,
  },
  async input => {
    const players = [...input.players]; // Create a copy to avoid modifying the original array
    const roomOwner = input.roomOwner;
    if (players.length < 4) {
      throw new Error('The game requires at least 4 players (1 Master, 1 Insider, 2 Commons).');
    }

    // Assign Master role to the room owner
    const roles: Record<string, string> = {};
    roles[roomOwner] = 'Master';

    // Remove the room owner from the players array for Insider selection
    const availablePlayers = players.filter(player => player !== roomOwner);

    // Randomly select the Insider
    const insiderIndex = Math.floor(Math.random() * availablePlayers.length);
    const insider = availablePlayers[insiderIndex];
    roles[insider] = 'Insider';

    // Assign the remaining players as Commons
    availablePlayers.forEach(player => {
      if (!roles[player]) {
        roles[player] = 'Common';
      }
    });

    return {
      roles,
    };
  }
);
