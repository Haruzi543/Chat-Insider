# **App Name**: Chat Insider

## Core Features:

- Room Creation and Nickname: Allow users to create chat rooms with unique, shareable codes, and set a nickname.
- Room Joining: Enable users to join existing rooms by entering the room code and nickname.
- Real-Time Chat: Implement real-time messaging using Socket.IO with displayed sender nicknames and timestamps.
- User List and Notifications: Display list of room participants. Update it in real time. Notify users upon joining/leaving of other users
- Start Insider Game: Enable the room owner to start an 'Insider' mini-game, setting a target word.
- Role Assignment Tool: Randomly assign one player as the 'Insider,' one as the 'Master', and the others as 'Commons'. The tool will communicate the assignment privately.
- Question Phase: Facilitate a question phase with a visible timer, where Commons and the Insider ask yes/no questions, and the Master responds.
- Voting Phase and Results: Conduct a voting phase where players discuss and vote to identify the Insider, displaying game results upon completion.

## Style Guidelines:

- Primary color: #5B89FF (a vibrant blue) for a modern and engaging feel.
- Background color: #E8EDFF (a very light desaturated blue, same hue as the primary), providing a clean and calming backdrop.
- Accent color: #945BFF (a purple hue, analogous to the primary blue), used for interactive elements and highlights.
- Body and headline font: 'Inter', a grotesque-style sans-serif, suitable for both headlines and body text.
- Use flat, minimalist icons for interactive elements to maintain a clean and modern UI.
- Implement a responsive layout using Tailwind CSS (via CDN) to ensure the application is accessible and functional across different devices and screen sizes.
- Incorporate subtle transitions and animations for UI elements to enhance user experience and provide visual feedback.