const axios = require('axios');
const Utils = require('./utils');

class FunCommands {
    constructor() {
        this.utils = new Utils();
        this.cache = new Map();
    }

    // Get random fact
    async getFact() {
        try {
            const { data } = await axios.get('https://nekos.life/api/v2/fact');
            return data.fact;
        } catch {
            return "Cats can make over 100 different sounds.";
        }
    }

    // Get joke
    async getJoke() {
        try {
            const { data } = await axios.get('https://v2.jokeapi.dev/joke/Any?type=single');
            return data.joke || "Why don't scientists trust atoms? Because they make up everything!";
        } catch {
            return "What do you call a fake noodle? An impasta!";
        }
    }

    // Get quote
    async getQuote() {
        try {
            const { data } = await axios.get('https://api.quotable.io/random');
            return {
                quote: data.content,
                author: data.author
            };
        } catch {
            return {
                quote: "The only way to do great work is to love what you do.",
                author: "Steve Jobs"
            };
        }
    }

    // Get meme
    async getMeme() {
        try {
            const { data } = await axios.get('https://meme-api.com/gimme');
            return {
                url: data.url,
                title: data.title,
                subreddit: data.subreddit
            };
        } catch {
            return {
                url: 'https://i.imgflip.com/1bij.jpg',
                title: 'One Does Not Simply',
                subreddit: 'memes'
            };
        }
    }

    // Truth detector (fun)
    detectTruth() {
        const responses = [
            "Truth! ✅",
            "Lie! ❌",
            "Mostly true! 👍",
            "Mostly false! 👎",
            "Hard to tell... 🤔",
            "That's 100% true! 💯",
            "That's false! 🚫"
        ];
        return responses[Math.floor(Math.random() * responses.length)];
    }

    // Flip coin
    flipCoin() {
        return Math.random() < 0.5 ? 'Heads' : 'Tails';
    }

    // Roll dice
    rollDice(sides = 6) {
        return Math.floor(Math.random() * sides) + 1;
    }

    // Random number
    randomNumber(min = 1, max = 100) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // 8-ball magic
    magic8ball() {
        const answers = [
            "Yes", "No", "Maybe", "Ask again later",
            "Definitely", "Absolutely not", "For sure",
            "I doubt it", "Most likely", "Very doubtful"
        ];
        return answers[Math.floor(Math.random() * answers.length)];
    }
}

module.exports = FunCommands;
