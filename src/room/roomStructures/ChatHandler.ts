import ChatMessage from "../classes/ChatMessage";
import Chat from "./Chat";
import GameCommandHandler, {
  GameCommandError,
} from "../commands/GameCommandHandler";
import gameCommandsMap from "../commands/GameCommands";
import CommandHandler, { CommandError } from "../commands/CommandHandler";
import CommandMessage from "../classes/CommandMessage";
import COLORS from "../utils/colors";
import Room from "./Room";
import { TEAMS } from "../utils/types";

export default class ChatHandler {
  static handleOffensiveMessage(chatObj: ChatMessage): false {
    // Ban logic here
    return false;
  }

  static maybeHandleTeamChat(chatObj: ChatMessage): false {
    if (chatObj.author.team === TEAMS.SPECTATORS) return false;

    const teamPlayers =
      chatObj.author.team === TEAMS.RED
        ? Room.players.getRed()
        : Room.players.getBlue();

    const teamColor =
      chatObj.author.team === TEAMS.RED
        ? COLORS.HaxballRed
        : COLORS.HaxballBlue;

    const msg = chatObj.content.substring(Chat.PREFIX.TEAMCHAT.length).trim();

    // Now concat the message and the playername
    const msgFormatted = `${chatObj.author.shortName}: ${msg}`;

    // Now send the message to the team players
    teamPlayers.forEach((player) => {
      Chat.send(msgFormatted, { color: teamColor, id: player.id });
    });

    return false;
  }

  static maybeHandlePrivateMessage(chatObj: ChatMessage): boolean {
    const words = chatObj.content.split(/\s+/);

    // Must have "@@target message..."
    if (words.length < 2) {
      chatObj.replyError(
        `Usage: ${Chat.PREFIX.PRIVATEMESSAGE}playername message`
      );
      return false;
    }

    // Example: "@@John_Doe hello" -> "john_doe"
    const targetToken = words[0]
      .substring(Chat.PREFIX.PRIVATEMESSAGE.length)
      .toLowerCase();

    // match by converting player.name spaces -> underscores
    const players = Room.players.find();

    // Find exact match by normalized underscore-name
    const matches = players.filter((p) => {
      const pKey = p.name.replace(/\s+/g, "_").toLowerCase();
      return pKey === targetToken;
    });

    if (matches.length === 0) {
      const availablePlayers = players
        .map((p) => p.name.replace(/\s+/g, "_"))
        .join(", ");
      chatObj.replyError("Player not found. Check the player name.");
      chatObj.replyError(
        `Tip: use underscores for spaces. Example: ${Chat.PREFIX.PRIVATEMESSAGE}Player_Name`
      );
      return false;
    }

    if (matches.length > 1) {
      // Rare, but if two players normalize to same key, tell the user
      chatObj.replyError(
        `Multiple players match "${Chat.PREFIX.PRIVATEMESSAGE}${targetToken}". Please be more specific.`
      );
      return false;
    }

    const targetPlayer = matches[0];

    // basic error handling if no message or if player tries to message themselves
    const messageContent = words.slice(1).join(" ").trim();
    if (!messageContent) {
      chatObj.replyError(
        `Usage: ${Chat.PREFIX.PRIVATEMESSAGE}playername message`
      );
      return false;
    }

    if (chatObj.author.id === targetPlayer.id) {
      chatObj.replyError("You cannot send a message to yourself!");
      return false;
    }

    const messageToSender = `📝 [To ${targetPlayer.shortName}] ${messageContent}`;
    const messageToReceiver = `📝 [From ${chatObj.author.shortName}] ${messageContent}`;

    Chat.send(messageToSender, { color: 0xcceb94, id: chatObj.author.id });
    Chat.send(messageToReceiver, { color: 0xcceb94, id: targetPlayer.id });

    return false;
  }

  static handlePlayerMuted(chatObj: ChatMessage): false {
    chatObj.reply("You are muted");
    return false;
  }

  static handleChatSilenced(chatObj: ChatMessage): false {
    chatObj.reply("The chat is silenced");
    return false;
  }

  static maybeHandleCommand(chatObj: ChatMessage): boolean {
    const cmdMessage = new CommandMessage(chatObj.content, chatObj.author);

    const cmdHandler = new CommandHandler(cmdMessage);
    try {
      const commandExists = cmdHandler.loadCommand();

      if (!commandExists)
        throw new CommandError(
          `Command ${cmdMessage.commandName} does not exist`
        );

      cmdHandler.validateAndRun();
    } catch (error) {
      // If we get an error, check what kind of error we have
      const isCommandError = error instanceof CommandError;

      if (isCommandError) {
        const commandError = error as CommandError;

        chatObj.replyError(commandError.errorMsg);
      } else {
        Chat.sendBotError(error.message);
      }

      return false;
    }

    // We know the command is defined since there werent any errors
    // return cmdHandler.command!.showCommand;
    return false;
  }

  static handleGameCommand(chatObj: ChatMessage): boolean {
    // We know game command is defined since we already checked with isGameCommand()
    const gameCommand = gameCommandsMap.get(chatObj.content.toLowerCase())!;

    try {
      new GameCommandHandler(chatObj, gameCommand).validateAndRun();
    } catch (error) {
      // If we get an error, check what kind of error we have

      const isGameCommandError = error instanceof GameCommandError;

      if (isGameCommandError) {
        const gameError = error as GameCommandError;
        if (gameError.sendToPlayer) {
          // Send the error message to the player
          chatObj.replyError(gameError.message);
        }
      } else {
        Chat.sendBotError(error.message);
      }
      return false;
    }

    return gameCommand!.showCommand;
  }
}
