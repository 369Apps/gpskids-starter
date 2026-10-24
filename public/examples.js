// GPS Kids Speak: one short worked example of Hook / Point / Example / Close for EVERY prompt (a tester, Oct 8 2026:
// "Need an example here. It is difficult to understand what these are."). Read-only cues: kids plan in their heads,
// no typing. Same shape as BANK in prompts.js (band -> type -> list, in the same order) plus the grown-up list.
// Pure data + one lookup. No storage, no network. Plain English, no em dashes.
import { BANK, ADULT_LIST, EXPLAIN_TAIL } from "./prompts.js";

export const PARTS = [["hook", "Hook", "Grab attention"], ["point", "Point", "Your big idea"], ["example", "Example", "Show it"], ["close", "Close", "Say it again"]];

const X = (hook, point, example, close) => ({ hook, point, example, close });
export const EX = {
  sprouts: {
    math: [
      X("Who likes apples? I do!", "There are 5 apples in all.", "3 red and 2 green. 3 plus 2 is 5.", "So the answer is 5 apples."),
      X("Did you know a dog walks on 4 legs?", "2 dogs have 8 legs.", "One dog has 4. Then 4 plus 4 is 8.", "So 2 dogs have 8 legs!"),
      X("Have you ever seen birds fly away?", "4 birds are left.", "6 birds, take away 2. 6 minus 2 is 4.", "So 4 birds stay on the fence."),
      X("Can you count by twos?", "The next number is 10.", "We add 2 each time. 8 plus 2 is 10.", "So 10 comes next."),
      X("Who loves cookies?", "7 is more, by 2 cookies.", "I count up from 5: 6, 7. That is 2 more.", "So 7 cookies is 2 more than 5."),
      X("Can you draw a triangle in the air?", "2 triangles have 6 sides.", "Each one has 3 sides. 3 plus 3 is 6.", "So the answer is 6 sides."),
      X("Hold up your hands! How many fingers?", "You can still see 6 fingers.", "10 fingers, hide 4. 10 minus 4 is 6.", "So 6 fingers are showing."),
      X("How old are you?", "Mia's brother is 8.", "Mia is 6. 6 plus 2 is 8.", "So her brother is 8 years old."),
      X("Do you like patterns?", "A circle comes next.", "Circle, square, circle, square. They take turns.", "So the next one is a circle."),
      X("Look at your feet! How many shoes?", "There are 10 shoes in all.", "Each kid has 2. I count 2, 4, 6, 8, 10.", "So 5 kids have 10 shoes."),
    ],
    story: [
      X("Have you ever lost something?", "A little puppy got lost at the park.", "It followed the smell of hot dogs back to its family.", "And the puppy never wandered off again. The end!"),
      X("Guess what? I had the best day ever!", "First we went to the beach.", "Next we built a giant sand castle. Last we ate ice cream.", "That was my best day ever!"),
      X("Did you know some dragons are scared of the dark?", "Dex the dragon was afraid of the night.", "His friend the firefly lit up the sky for him.", "Now Dex is not scared. He has a friend!"),
      X("Do you like helping people?", "One day I helped my friend.", "She dropped her crayons, so I picked them up with her.", "Helping made us both happy."),
      X("What if your backpack was magic?", "My magic backpack can hold anything.", "Inside I found a tiny pony and a rainbow cookie.", "I love my magic backpack!"),
    ],
    explain: [
      X("Do you want a shiny smile?", "Brushing your teeth is easy.", "First put on toothpaste. Then brush every tooth. Last, rinse.", "That is how you brush your teeth!"),
      X("Did you know a big tree starts as a tiny seed?", "A seed needs dirt, water, and sun.", "First it grows roots. Then a green stem pops up.", "That is how a seed becomes a plant."),
      X("Are you hungry?", "Here is how to make my favorite sandwich.", "First get bread. Then add peanut butter and jam. Last, close it.", "Now you can make it too!"),
      X("Do you have a best friend?", "A good friend is kind.", "When my friend was sad, I sat with her at lunch.", "Be kind, and you will be a good friend."),
      X("Did you know germs are too tiny to see?", "We wash our hands to wash away germs.", "After I play outside, I use soap and water.", "Clean hands help us stay healthy!"),
    ],
    persuade: [
      X("Guess the best animal in the world?", "Dolphins are the best animal.", "They are smart, they play, and they jump so high!", "So dolphins are the best. Do you agree?"),
      X("Do you like yummy food?", "You should try pizza.", "It is warm and cheesy, and you pick the toppings.", "So please try pizza. You will love it!"),
      X("Who wants to have fun?", "Let's go to the park this weekend.", "We can swing, slide, and have a picnic.", "So can we go to the park, please?"),
      X("Do you love recess?", "Recess should be longer.", "When we play, we feel happy and ready to learn.", "So please make recess longer!"),
      X("Do you like funny stories?", "You should read my favorite book.", "It has a silly pig who drives a bus.", "So read it! You will laugh a lot."),
    ],
    intro: [
      X("Hi there!", "My name is Sam and I am 6.", "I love drawing cats.", "Nice to meet you!"),
      X("Hello! Can I play too?", "I am Ava. I am new here.", "I like jumping rope and puzzles.", "Do you want to be friends?"),
      X("Hi, everyone!", "My name is Leo.", "I like blue, pasta, and tag.", "Thanks for listening!"),
      X("Guess what I want to be?", "I am Mia, and I want to be a doctor.", "I want to help people feel better.", "That is my big dream!"),
      X("Stand back! A hero is here!", "I am Super Sam!", "My super power is making people laugh.", "Super Sam, here to help!"),
    ],
    impromptu: [
      X("What if I could fly?", "I would fly to the moon.", "I would wave at the stars on the way.", "Flying to the moon would be the best day!"),
      X("Guess what I would do as the teacher?", "I would make learning fun.", "We would read outside and have a dance break.", "That is what I would do as the teacher!"),
      X("Want to hear something funny?", "My dog stole my sock!", "He ran around the house with it on his head.", "We all laughed so much!"),
      X("What if animals could talk?", "I would talk to my cat first.", "I would ask her why she sleeps all day.", "I bet she has a funny answer!"),
      X("Do you know what makes me happy?", "3 things make me happy.", "My family, my toys, and ice cream.", "Those 3 things make me smile!"),
    ],
  },
  explorers: {
    math: [
      X("Who wants pizza?", "Each person gets 2 slices.", "4 people share 8 slices. 8 divided by 4 is 2.", "So everyone gets 2 slices."),
      X("Can you spot the pattern?", "The next number is 48.", "Each number doubles. 24 times 2 is 48.", "So 48 comes next."),
      X("How much do 6 pencils cost?", "6 pencils cost $1.50.", "25 cents times 6 is 150 cents.", "150 cents is $1.50."),
      X("Do you like reading?", "It takes 6 days.", "90 pages, 15 a day. 90 divided by 15 is 6.", "So I finish the book in 6 days."),
      X("Perimeter means all the way around.", "The perimeter is 20 cm.", "Add all 4 sides: 7 plus 3 plus 7 plus 3.", "That makes 20 cm."),
      X("Who has more marbles?", "Sam has 12 marbles.", "Leo has 6 and Sam has twice that, 12. 6 plus 12 is 18.", "So Sam has 12."),
      X("Can you cut 40 in half, twice?", "The answer is 10.", "Half of 40 is 20. Half of 20 is 10.", "So half of half of 40 is 10."),
      X("Who likes movies?", "The movie ends at 5:15.", "3:45 plus 1 hour is 4:45. Plus 30 minutes is 5:15.", "So it ends at 5:15."),
      X("Which slice of cake is bigger?", "3/4 is bigger.", "3/4 is 9/12 and 2/3 is 8/12.", "9 is more than 8, so 3/4 wins."),
      X("Ever picked teams at recess?", "4 full teams, and 4 kids left over.", "4 teams of 5 is 20. 24 minus 20 is 4.", "So 4 teams, with 4 kids left."),
    ],
    story: [
      X("What if a new door appeared at school?", "Maya found a door that was not there yesterday.", "Behind it was a library where the books could talk.", "She went back every day after that."),
      X("Can a robot have friends?", "Bolt the robot wanted a friend.", "He fixed a girl's broken bike, and she smiled at him.", "That is how Bolt learned that friends help each other."),
      X("Have you ever wanted to quit?", "Learning to swim was hard for me.", "I kept trying every Saturday until I swam across the pool.", "I learned that practice makes hard things easier."),
      X("The map was not supposed to glow...", "But it did, and it showed a secret path.", "We followed it to an old tree with a box of coins.", "Now we keep the map safe, just in case."),
      X("Have you ever been losing by a lot?", "Our team almost gave up, but we didn't.", "We were down 3 goals. Then we passed more and scored 4.", "Never give up, because things can change."),
    ],
    explain: [
      X("Have you ever seen a rainbow after rain?", "A rainbow forms when sunlight hits raindrops.", "The drops bend the light and split it into colors.", "Sun plus rain makes a rainbow."),
      X("Want to learn a fun game?", "Tag is easy to play.", "One person is it. They tap someone, then that person is it.", "That's how you play tag. Ready to run?"),
      X("Why does the sun go away at night?", "Earth spins, and that makes day and night.", "When our side faces the sun, it is day. When it turns away, it is night.", "One spin takes about 24 hours."),
      X("Did you know bees help make your lunch?", "Bees carry pollen from flower to flower.", "That helps apples, berries, and pumpkins grow.", "No bees means a lot less food!"),
      X("Is there something you really want?", "I would save a little money every week.", "If I save $5 a week, I can buy a $20 game in 4 weeks.", "Small savings add up to big things."),
    ],
    persuade: [
      X("Who wants to see real sharks?", "Our next field trip should be the aquarium.", "We can learn about sea animals and walk through a shark tunnel.", "So vote for the aquarium!"),
      X("What if you could pick one subject?", "Kids should choose one subject they learn.", "If I love space, I would work harder in a space class.", "Let kids choose, and they will love learning."),
      X("Mom, Dad, can I ask you something big?", "I think we should get a dog.", "I will walk it, feed it, and it will keep us all active.", "So can we please get a dog?"),
      X("What is better than TV?", "Reading is more fun than watching TV.", "In a book, you make the pictures in your own head.", "So pick up a book tonight!"),
      X("Who likes building things?", "Our school should start a Lego club.", "We can build together and learn how machines work.", "Please start a Lego club!"),
    ],
    intro: [
      X("Hi, everyone!", "I love chess.", "I beat my dad last week!", "Thanks for listening!"),
      X("Hey, team!", "I play defense.", "I always cheer for my teammates, even when we lose.", "I'm happy to be on this team!"),
      X("Hi, everyone!", "My goal this year is to read 20 books.", "I already finished 5. The last one was about space.", "Wish me luck on my goal!"),
      X("Welcome to the show!", "Today's hobby is baking!", "Last week I made cupcakes with blue frosting.", "Bake something fun this weekend. Bye!"),
      X("Can I describe myself in 3 words?", "I am curious, kind, and funny.", "I am curious because I always ask how things work.", "Curious, kind, and funny. That's me!"),
    ],
    impromptu: [
      X("Who loves homework? Not many hands!", "Homework should be shorter, not banned.", "A little practice helps, but too much leaves no time to play.", "So keep homework short and useful."),
      X("What if your room cleaned itself?", "I would invent a room cleaning robot.", "It would pick up toys and make the bed in 1 minute.", "More time to play, less time cleaning!"),
      X("Want to hear my new house rule?", "No phones at dinner.", "Then we can talk and laugh together.", "That rule would make dinner better."),
      X("Ocean or space? Big choice!", "I would live in space.", "I could float around and see Earth from far away.", "Space would be the coolest home."),
      X("Do you have a hero?", "I look up to my grandma.", "She learned to use a computer at 70.", "She shows me it's never too late to learn."),
    ],
  },
  leaders: {
    math: [
      X("Who loves a sale?", "The sale price is $30.", "25% of 40 is 10. 40 minus 10 is 30.", "So the shirt costs $30."),
      X("An average can hide a missing number.", "The third number is 11.", "The total must be 3 times 12, which is 36. 36 minus 25 is 11.", "So the missing number is 11."),
      X("How fast is this train?", "It goes 300 miles in 5 hours.", "180 divided by 3 is 60 miles per hour. 60 times 5 is 300.", "So the answer is 300 miles."),
      X("This pattern shows up in pinecones and shells.", "The next number is 13.", "Each number is the sum of the two before it. 5 plus 8 is 13.", "So 13 comes next."),
      X("Let's find the mystery number x.", "x equals 5.", "Take 5 from both sides: 3x is 15. Then 15 divided by 3 is 5.", "So x is 5."),
      X("Baking a lot of cookies?", "You need 5 cups of flour.", "30 cookies is 2.5 batches of 12. 2.5 times 2 cups is 5.", "So use 5 cups."),
      X("How many handshakes at a party of 5?", "There are 10 handshakes.", "The first person shakes 4 hands, then 3, 2, 1. That adds up to 10.", "So 10 handshakes in all."),
      X("A square hides its side in its area.", "The perimeter is 28 inches.", "7 times 7 is 49, so each side is 7. 4 times 7 is 28.", "So the perimeter is 28 inches."),
      X("Feeling lucky?", "The chance is 1 in 4, or 25%.", "The 4 outcomes are HH, HT, TH, TT. Only one is two heads.", "So it's 1 in 4."),
      X("Ever had your phone die at the worst time?", "After 4 hours it is under 50%.", "After 3 hours it is 55%. After 4 hours it is 40%.", "So 4 full hours."),
    ],
    story: [
      X("Have you ever had to lead before you felt ready?", "I led my group project when our leader got sick.", "I made a simple list, and everyone picked one task.", "I learned you can lead before you feel ready."),
      X("It's 2046, and robots run the factories.", "People spend their days on creative and caring work.", "My neighbor teaches kids to paint. Another runs a garden.", "AI does the jobs, but people bring the heart."),
      X("Have you ever made a mistake that turned out great?", "I spilled paint on my art project.", "I turned the spill into a sunset, and it won first prize.", "Sometimes mistakes lead to your best ideas."),
      X("Pizza or tacos? That's how the fight started.", "Two friends could not agree on a party plan.", "They listened to each other and served pizza tacos.", "Listening turned a fight into a fun idea."),
      X("No one believed me about the leak.", "I knew the school roof was leaking, but no one cared.", "So I brought a bucket of rainwater to the meeting.", "And that's when everyone finally listened."),
    ],
    explain: [
      X("Ever wonder where videos live?", "Videos travel to you in tiny pieces.", "A server sends small packets over Wi-Fi, and your phone puts them together.", "That is how a video gets to your screen."),
      X("What if your body could practice fighting germs?", "A vaccine trains your body to fight a sickness.", "It shows your body a harmless piece of the germ, so it learns to spot it.", "If the real germ comes, your body is ready."),
      X("Have you ever said sorry and it didn't work?", "A good apology has 3 parts.", "Say what you did, say sorry, and say how you will fix it.", "Name it, own it, fix it."),
      X("What if your money could make money?", "Compound interest is interest on your interest.", "$100 at 10% becomes $110, then $121 the next year.", "The longer you wait, the faster it grows."),
      X("Would you rather follow a boss or a leader?", "A boss gives orders. A leader shows the way.", "A good captain runs the drills with the team.", "Bosses push, leaders pull."),
    ],
    persuade: [
      X("Who was tired this morning? Raise your hand.", "School should start one hour later.", "Sleepy students can't focus in first period.", "Give us one more hour, and we will learn more."),
      X("What scares people more than spiders? Public speaking!", "Every kid should learn public speaking.", "It helps in class, in interviews, and with friends.", "Start early, and the confidence lasts a lifetime."),
      X("Ever forgot a homework deadline?", "Our app, HomeworkBuddy, reminds kids of every due date.", "It sends a quick alert the night before.", "Use it and never miss a deadline again."),
      X("Where do kids in our town go after school?", "Our city should build a skate park.", "It gives kids a safe place to exercise and meet friends.", "Please build it, and kids will come."),
      X("Is your phone helping you learn?", "Phones should stay in backpacks during class.", "When phones buzz, everyone loses focus.", "Put phones away, and learning goes up."),
    ],
    intro: [
      X("Hi, I'm Priya, and I want to be your president.", "I will make sure every student is heard.", "I'll put an idea box in every classroom.", "Vote Priya for a voice that listens!"),
      X("Thank you for meeting me.", "I'm Jordan, and I would love to be a camp helper.", "I help my little cousins with crafts every weekend.", "I'm ready to work hard and have fun."),
      X("Hi, team. I'm excited to work with you.", "I'm Sara, and I'll lead our science project.", "I'll make sure everyone gets a job they enjoy.", "Let's build something great together."),
      X("Here's something you don't know about me.", "I'm Leo, and I can solve a Rubik's cube in 1 minute.", "I taught myself with videos last summer.", "Ask me and I'll teach you!"),
      X("What matters most to me? Animals.", "I'm Mei, and I care about helping pets find homes.", "I walk dogs at a shelter on Saturdays.", "Every pet deserves a home."),
    ],
    impromptu: [
      X("If AI can write, why should we?", "Students should still learn to write.", "Writing helps you think clearly, even when you speak.", "AI can help, but your ideas need your own words."),
      X("What skill will matter most in 10 years?", "Communication is the most important skill.", "Even great inventors need to explain their ideas.", "Learn to speak well, and doors open."),
      X("If I could fix one thing in the world...", "I would make sure every kid has clean water.", "Some kids walk a long way every day just to get water.", "Clean water gives kids time to learn and play."),
      X("Captain or teammate? Which is better?", "A great team player matters as much as a leader.", "In soccer, many goals start with a perfect pass.", "Every team needs both."),
      X("Adults, here is something you miss about us.", "Kids my age feel a lot of pressure.", "Tests, sports, and social media, all at once.", "Please listen before you judge."),
    ],
  },
  trailblazers: {
    math: [
      X("Up 10%, then down 10%. Back to the start? Not quite.", "The final price is $198.", "Up 10% is $220. 10% off $220 is $22 off, so $198.", "So it ends $2 below $200."),
      X("Two numbers, two clues.", "The numbers are 12 and 8.", "12 plus 8 is 20, and 12 times 8 is 96.", "So the answer is 12 and 8."),
      X("Why do new cars lose value so fast?", "64% of the value is left.", "Each year keeps 80%. 0.8 times 0.8 is 0.64.", "So after 2 years, 64% is left."),
      X("Some students do both, and that is the trick.", "5 students do neither.", "18 plus 12 minus 5 is 25 who do at least one. 30 minus 25 is 5.", "So 5 do neither."),
      X("Legend says young Gauss solved this in seconds.", "The sum is 5,050.", "Pair 1 with 100, 2 with 99, and so on. That is 50 pairs of 101.", "50 times 101 is 5,050."),
      X("Let's balance this equation.", "x equals 11.", "Subtract x from both sides: x minus 7 is 4. Add 7, and x is 11.", "So x is 11."),
      X("Why is 7 the most common roll?", "The probability is 1 in 6.", "6 of the 36 rolls add up to 7, like 1 and 6 or 3 and 4.", "6 out of 36 is 1 in 6."),
      X("How fast does saved money grow?", "After 2 years it is $1,102.50.", "Year 1 makes $1,050. Year 2 adds 5% of that: $52.50.", "Interest on interest gives the extra $2.50."),
      X("One clue: the length is twice the width.", "The area is 72.", "Width w, length 2w. 6w is 36, so the width is 6 and the length is 12.", "6 times 12 is 72."),
      X("How many ways can 4 letters line up, 3 at a time?", "There are 24 arrangements.", "4 choices first, then 3, then 2. 4 times 3 times 2 is 24.", "So 24 different arrangements."),
    ],
    story: [
      X("I used to think I wasn't a math person.", "One moment changed that.", "I explained a problem to a friend, and she finally got it.", "Now I see myself as someone who can teach."),
      X("Everyone laughed, and I almost did too.", "I stood up for a new kid in the cafeteria.", "I said \"That's not funny\" and sat with him.", "Doing the right thing felt scary, then great."),
      X("My first robot fell apart on stage.", "That failure taught me to test early.", "Now our team tests every part a week before.", "Failing early helped me succeed later."),
      X("My coach never raised her voice.", "She leads by example.", "After a big loss, she was the first to pick up the cones.", "That's the kind of leader I want to be."),
      X("In 2050, everyone has an AI partner.", "Maya's AI could do everything except make her brave.", "When she had to give a speech, the AI could only cheer.", "Some things only a human can do."),
    ],
    explain: [
      X("Why do some concert tickets cost so much?", "Prices go up when many people want few tickets.", "A stadium has 50,000 seats, but a million fans want in.", "High demand plus low supply means a high price."),
      X("How does a chatbot know what to say?", "It predicts the next word, again and again.", "It learned patterns from huge amounts of text.", "So it builds an answer one word at a time."),
      X("One number can change the price of a car.", "A credit score shows how well you pay back money.", "Pay your bills on time and your score goes up.", "A good score means cheaper loans."),
      X("Ever been in a meeting that went nowhere?", "A great meeting has a goal, a timer, and next steps.", "Start with one question. End with who does what, by when.", "Clear goal in, clear actions out."),
      X("Why is my toast always burnt?", "The scientific method answers questions with tests.", "Guess the setting is too high, try a lower one, check the toast.", "Ask, guess, test, learn."),
    ],
    persuade: [
      X("How much did you spend on textbooks you used once?", "Our app lets students rent textbooks from each other.", "A $100 book could rent for $15 a semester.", "Fund us, and help students save."),
      X("Which skill do employers ask for again and again?", "Public speaking should be a required class.", "Every interview and every class presentation needs it.", "Make it required, and every student wins."),
      X("What would you do with one more free day?", "I support a 4-day school week.", "Students could rest, work, or catch up on projects.", "Better rest means better learning."),
      X("Who was your favorite teacher, and why?", "Kindness is a leadership skill.", "People work harder for leaders who care about them.", "Kind leaders build strong teams."),
      X("Who uses the parks and buses after school? Teens.", "Teens should have a say in local decisions.", "A teen board could tell the city which parks need lights.", "Give teens a voice, and the town gets better."),
    ],
    intro: [
      X("Hi, I'm Ravi.", "I build simple apps that solve everyday problems.", "Last year I made a homework tracker my whole class uses.", "Next, I want an internship in tech."),
      X("Thanks for asking.", "I'm Ana, a student who loves solving problems.", "I lead our debate team and tutor younger kids.", "I'm looking for a place to grow and help."),
      X("Hi, I've followed your work for a while.", "I'm Kai, and I want to become an engineer.", "I built a solar phone charger last summer.", "I'd love to learn from you."),
      X("Welcome, everyone. I'm your captain, Lena.", "My job is to help each of you get better.", "I'll learn every name and every goal this week.", "Let's work hard and have fun."),
      X("Hi, I'm Omar.", "I'm starting a small business selling handmade bracelets.", "I've sold 50 so far at school events.", "I'd love to hear what you're building."),
    ],
    impromptu: [
      X("If AI can do the work, what's left for us?", "Humans bring care, judgment, and creativity.", "A computer can read a scan, but a nurse holds your hand.", "Our value is being human."),
      X("Should a 10-year-old have Instagram?", "Yes, social media should have an age limit.", "Younger kids can struggle with comparing themselves to others.", "Wait a few years, then join with care."),
      X("I used to think asking for help was weak.", "I changed my mind.", "When I asked my teacher for help, my grade went from a C to an A.", "Asking for help is smart, not weak."),
      X("Have you seen a group chat turn mean?", "A good leader in a group chat sets the tone.", "When someone gets teased, a leader says stop or changes the subject.", "Lead with kindness, even online."),
      X("Would you rather be liked or respected?", "Respect matters more.", "People may not always like a fair referee, but they trust one.", "Earn respect, and real friends follow."),
    ],
  },
};
// Grown-ups (GPS Moms & Dads, PREVIEW): same order as ADULT_LIST.
export const EX_ADULT = [
  X("You know how hard it is to find a good plumber?", "I connect families with trusted local repair pros.", "Last week a mom got her heater fixed in 2 hours.", "That's what I do: fast help you can trust."),
  X("Can everyone raise a glass?", "Tonight we celebrate my friend Raj.", "When I moved here, he showed up with pizza and a toolbox.", "To Raj, the friend everyone deserves!"),
  X("Who pays for the roads and the school bus?", "Taxes are money we all share to pay for things we all use.", "It's like a potluck: each family brings a dish, so everyone eats.", "So taxes help all of us, together."),
  X("Thanks for thinking of me for this.", "I can't take on another project right now.", "I need to finish the launch well by Friday.", "Could we look at it again next month?"),
  X("Hi, everyone. I'm Priya, Aria's mom.", "I care about kids building confidence.", "I'd love to help with the school talent show.", "Great to meet you all."),
  X("My worst email went to the whole company.", "I learned to slow down before I hit send.", "Now I read every important email out loud first.", "One mistake made me a better communicator."),
  X("Can we talk about the weekly report?", "It has been late the last three weeks.", "That makes our team miss the Monday deadline.", "Can we agree on Friday afternoon from now on?"),
  X("How does a video get to your tablet?", "The internet is like a giant mail system for computers.", "Your video is split into tiny packages that travel to our house.", "Then your tablet puts them back together."),
  X("Who here avoids the corner of Elm and Main?", "We need a crosswalk there.", "Kids cross there every morning on the way to school.", "One crosswalk can keep our kids safe."),
  X("Look at what we built!", "This project worked because of each of you.", "When the server crashed, everyone stayed and fixed it together.", "Thank you. Let's celebrate!"),
  X("Thanks for calling.", "I'm not interested at this time.", "Please take me off your list.", "Have a good day. Goodbye."),
  X("If kids learn one thing before 18, what should it be?", "Every child should learn to manage money.", "Knowing how to budget keeps people out of debt later.", "Teach money early, and it pays for life."),
  X("Thanks for meeting with me.", "I'd like to talk about a raise.", "This year I led two big projects and trained three new hires.", "Can we agree on a new salary by next month?"),
  X("Did you know Thomas Edison tried over 1,000 materials for the light bulb?", "Mistakes are how we learn.", "Each try that failed showed him what not to use next.", "So when you make a mistake, you're one step closer."),
  X("Want to hear about my very first job?", "I started as a cashier at a grocery store.", "On day one I gave too much change, and my boss helped me fix it.", "Everyone starts somewhere."),
  X("You know when a website is so slow you want to throw your phone?", "I make websites fast.", "I helped a bakery's site load in one second.", "That's what I do."),
  X("Who wants a weekend with zero chores?", "Let's do a picnic and movie weekend.", "Saturday at the lake, Sunday on the couch with pizza.", "Easy, cheap, and fun. Who's in?"),
  X("I know you love that game.", "No more screen time today.", "We already had our hour, and your eyes need a break.", "Let's play a board game together instead."),
  X("When did we last spend a whole day without screens?", "Every family should have one screen-free day a week.", "We play games, cook together, and actually talk.", "Try one Sunday. You might love it."),
  X("Welcome to the street!", "We're so happy you're here.", "I'm Sam from the blue house. Ask us anything.", "Come by for coffee anytime."),
];
// Backup cues by type (only if a prompt has no example of its own).
const BY_TYPE = {
  math: X("Can you guess the answer?", "Say the answer first.", "Then say how you got it, step by step.", "Say the answer again at the end."),
  story: X("Start with a question or a surprise.", "Say what your story is about.", "Tell the most exciting part.", "Say how it ended."),
  explain: X("Ask a question about it.", "Say what it is in one line.", "Give the steps: first, next, last.", "Say the main idea again."),
  persuade: X("Ask a question your listener cares about.", "Say what you want.", "Give your best reason.", "Ask for a yes."),
  intro: X("Say hi with a smile.", "Share one thing you love.", "Add one fun detail.", "Say thank you."),
  impromptu: X("Ask a question about the topic.", "Pick a side.", "Give one reason and one example.", "Say your side again."),
};

const MAP = new Map();
for (const [band, types] of Object.entries(BANK)) for (const [type, list] of Object.entries(types)) list.forEach((raw, k) => {
  const p = typeof raw === "string" ? raw : raw.p + EXPLAIN_TAIL, ex = EX[band] && EX[band][type] && EX[band][type][k];
  if (ex) MAP.set(p, ex);
});
ADULT_LIST.forEach((x, k) => { if (EX_ADULT[k]) MAP.set(x.p, EX_ADULT[k]); });
// item = { p, type } from promptAt(). Always returns all four parts.
export function exampleFor(item) {
  return MAP.get(item && item.p) || BY_TYPE[item && item.type] || BY_TYPE.impromptu;
}
export const hasOwnExample = (item) => MAP.has(item && item.p);
