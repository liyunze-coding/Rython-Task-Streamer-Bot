const commands = configs.commands;
const responseTemplates = configs.responses;
const settings = configs.settings;

const client = new StreamerbotClient({
	host: "127.0.0.1",
	port: 6968,
	subscribe: {
		YouTube: ["Message"],
		Twitch: ["ChatMessage"],
	},
	onData: onData,
});

/**
 * Responds to a message based on the source platform.
 *
 * @param {string} template - The template string containing placeholders.
 * @param {Object} params - The object containing key-value pairs to replace in the template.
 * @param {string} source - The source platform of the message ("YouTube" or other).
 * @returns {Promise} A promise that resolves to the response from the bot action.
 */
async function respond(template, params, source) {
	Object.keys(params).forEach((key) => {
		template = template.replace(`{${key}}`, params[key]);
	});

	if (source === "YouTube") {
		const streamerYTBotResponse = await client.doAction(
			"390ff8f2-7945-4eba-be2a-a1c0e4ba535d",
			{
				response: template,
			}
		);
	} else {
		// 8ff809be-e269-4f06-9528-021ef58df436
		const streamerTwitchBotResponse = await client.doAction(
			"8ff809be-e269-4f06-9528-021ef58df436",
			{
				response: template,
			}
		);
	}
}

/**
 * Handles incoming data, processes it if it's a YouTube message event.
 *
 * @param {Object} data - The incoming data object.
 * @param {Object} data.event - The event details.
 * @param {string} data.event.source - The source of the event.
 * @param {string} data.event.type - The type of the event.
 * @param {Object} data.data - The payload of the event.
 * @param {string} data.data.message - The message from the event.
 * @param {Object} data.data.user - The user who triggered the event.
 * @param {string} data.data.user.name - The name of the user.
 * @param {boolean} data.data.user.isOwner - Flag indicating if the user is the owner.
 * @param {boolean} data.data.user.isModerator - Flag indicating if the user is a moderator.
 */
function onData(data) {
	if (!data.event) return;
	if (data.event.source === "YouTube" && data.event.type === "Message") {
		const payload = data.data;

		console.log("payload", payload);

		// check if message starts with prefix
		if (!payload.message.startsWith("!")) return;

		const command = payload.message.split(" ")[0];

		// remove first word from message
		const message = payload.message.split(" ").slice(1).join(" ");

		// get user from payload
		const user = payload.user.name;

		// set flags
		const flags = {
			broadcaster: payload.user.isOwner,
			mod: payload.user.isModerator,
		};

		procressCommand(user, command, message, flags, data.event.source);
	} else if (
		data.event.source === "Twitch" &&
		data.event.type === "ChatMessage"
	) {
		console.log("Twitch message event", data);

		const payload = data.data;

		const command = payload.message.message.split(" ")[0];

		const user = payload.message.displayName;

		const message = payload.message.message.split(" ").slice(1).join(" ");

		// iterate through payload.message.badges
		// each iteration has name in an object
		// if name is "moderator" or "broadcaster", set flags.mod or flags.broadcaster to true
		const badges = payload.message.badges;

		const flags = {
			broadcaster: false,
			mod: false,
		};

		badges.forEach((badge) => {
			if (badge.name === "broadcaster") {
				flags.broadcaster = true;
			} else if (badge.name === "moderator") {
				flags.mod = true;
			}
		});

		procressCommand(user, command, message, flags, data.event.source);
	}
}

/**
 * Checks if the user is a moderator or broadcaster.
 *
 * @param {Object} flags - The flags object.
 * @param {boolean} flags.broadcaster - Flag indicating if the user is the broadcaster.
 * @param {boolean} flags.mod - Flag indicating if the user is a moderator.
 * @returns {boolean} Returns true if the user is a moderator or broadcaster, false otherwise.
 */
function isMod(flags) {
	return flags.broadcaster || flags.mod;
}

/**
 * Processes a command from a user.
 *
 * @param {string} user - The user who sent the command.
 * @param {string} command - The command to be processed.
 * @param {string} message - The message associated with the command.
 * @param {Object} flags - The flags object.
 * @param {boolean} flags.broadcaster - Flag indicating if the user is the broadcaster.
 * @param {boolean} flags.mod - Flag indicating if the user is a moderator.
 * @param {string} source - The source platform of the command.
 */
function procressCommand(user, command, message, flags, source) {
	let params = {
		user: user,
		task: message,
	};
	if (
		(command === "clear" && message === "done") ||
		commands.adminClearDoneCommands.includes(command)
	) {
		if (!isMod(flags)) {
			// user is not a mod or broadcaster
			return respond(responseTemplates.notMod, params, source);
		}
		cleardone();
		respond(responseTemplates.clearedDone, params, source);
	} else if (commands.addTaskCommands.includes(command)) {
		// ADD TASK

		if (message === "") {
			// check if message is empty
			return respond(responseTemplates.noTaskContent, params, source);
		}

		if (userHasTask(user)) {
			// check if user has a task pending
			return respond(responseTemplates.noTaskAdded, params, source);
		}

		addTask(user, message);

		respond(responseTemplates.taskAdded, params, source);
	} else if (commands.finishTaskCommands.includes(command)) {
		// FINISH TASK

		if (!userHasTask(user)) {
			// check whether user has task, if not, return
			return respond(responseTemplates.noTask, params, source);
		}

		let finishedTask = "";

		if (settings.showDoneTasks) {
			finishedTask = doneTask(user);
		} else {
			finishedTask = removeTask(user);
		}

		params.task = finishedTask;

		respond(responseTemplates.taskFinished, params, source);
	} else if (commands.deleteTaskCommands.includes(command)) {
		// DELETE TASK

		let removedTask = removeTask(user);

		params.task = removedTask;

		respond(responseTemplates.taskDeleted, params, source);
	} else if (commands.editTaskCommands.includes(command)) {
		// EDIT TASK

		if (!userHasTask(user)) {
			// check if user has a task pending
			return respond(responseTemplates.noTaskToEdit, params);
		}
		editTask(user, message);

		respond(responseTemplates.taskEdited, params, source);
	} else if (commands.checkCommands.includes(command)) {
		// CHECK YOUR OWN TASK OR OTHER PEOPLE'S TASK

		if (message === "") {
			if (checkTask(user) === "") {
				// check if user has a task pending
				return respond(responseTemplates.noTask, params);
			}

			let currentTask = checkTask(user);

			params.task = currentTask;

			respond(responseTemplates.taskCheck, params, source);
		} else {
			let mentioned = message.split(" ")[0];

			// remove @ if there is
			if (mentioned[0] === "@") {
				mentioned = mentioned.slice(1);
			}

			let currentTask = checkTask(mentioned);

			if (currentTask === "") {
				// check if user has a task pending
				return respond(responseTemplates.noTaskA, params);
			}

			let response = responseTemplates.taskCheckUser;

			// replace {user2} with mentioned user
			response = response.replace("{user2}", `@${mentioned}`);

			params.task = currentTask;

			respond(response, params, source);
		}
	} else if (commands.adminClearAllCommands.includes(command)) {
		if (!isMod(flags)) {
			// user is not a mod or broadcaster
			return respond(responseTemplates.notMod, user, source);
		}
		clearAllTasks();

		respond(responseTemplates.clearedAll, params);
	} else if (commands.adminDeleteCommands.includes(command)) {
		if (!isMod(flags)) {
			// user is not a mod or broadcaster
			return respond(responseTemplates.notMod, params, source);
		}
		adminDeleteTask(message);
		respond(responseTemplates.adminDeleteTasks, params, source);
	} else if (commands.nextTaskCommands.includes(command)) {
		if (!userHasTask(user)) {
			// check if user has a task pending
			return respond(responseTemplates.noTask, params);
		}

		if (message === "") {
			// check if message is empty
			return respond(responseTemplates.nextNoContent, params, source);
		}

		let completedTask = nextTask(user, message);
		let response = responseTemplates.taskNext;
		response = response.replace("{oldTask}", completedTask);
		response = response.replace("{newTask}", message);

		return respond(response, params);
	} else if (commands.helpCommands.includes(command)) {
		respond(responseTemplates.help, params, source);
	} else if (commands.additionalCommands[command]) {
		respond(commands.additionalCommands[command], params, source);
	} else {
		// command not found
	}
}
