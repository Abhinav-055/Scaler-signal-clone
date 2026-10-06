"""Demo data: 10 users, contacts, 8 direct chats, 3 groups, ~250 messages over 10 days.

Usage:
    python seed.py          # seed only if the database is empty (idempotent)
    python seed.py --reset  # wipe all data and seed again

Every phone number logs in with the OTP set in FIXED_OTP.
"""

import random
import sys
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import Base, SessionLocal
from app.models import (
    Attachment,
    Contact,
    Conversation,
    ConversationMember,
    Message,
    MessageReceipt,
    Reaction,
    User,
)
from app.models.types import utcnow
from app.services.auth import avatar_color_for

# key: (name, phone, username, about, avatar_url)
USERS: dict[str, tuple[str, str, str, str, str | None]] = {
    "a": ("Aarav Sharma", "+919800000001", "aarav", "Building things, one bug at a time", None),
    "p": (
        "Priya Patel",
        "+919800000002",
        "priya.p",
        "Product @ a startup. Chai > coffee",
        "https://randomuser.me/api/portraits/women/44.jpg",
    ),
    "r": ("Rohan Mehta", "+919800000003", "rohanm", "Weekend trekker 🏔️", None),
    "an": (
        "Ananya Iyer",
        "+919800000004",
        "ananya",
        "Carnatic music & code",
        "https://randomuser.me/api/portraits/women/68.jpg",
    ),
    "v": ("Vikram Singh", "+919800000005", "vikram", "Available", None),
    "s": ("Sara Khan", "+919800000006", "sarak", "Designing pixels ✨", None),
    "e": (
        "Emily Carter",
        "+919800000007",
        "emilyc",
        "London → Bengaluru",
        "https://randomuser.me/api/portraits/women/65.jpg",
    ),
    "l": ("Lucas Fischer", "+919800000008", "lucas", "Backend engineer. Berlin.", None),
    "m": ("Mei Lin Chen", "+919800000009", "meilin", "Busy, text me", None),
    "d": (
        "Diego Alvarez",
        "+919800000010",
        "diego",
        "¡Hola! Photographer 📷",
        "https://randomuser.me/api/portraits/men/32.jpg",
    ),
}

CONTACTS = {
    "a": ["p", "r", "an", "v", "s", "e", "d", "l", "m"],
    "p": ["a", "s", "m", "e", "l", "r"],
    "r": ["a", "v", "an", "s", "p"],
    "an": ["a", "r", "m"],
    "v": ["a", "r"],
    "s": ["p", "a", "r"],
    "e": ["a", "p", "l"],
    "l": ["e", "p", "a"],
    "m": ["p", "an", "a"],
    "d": ["a"],
}

SAMPLE_IMAGE = {
    "public_id": "seed/trek-view",
    "secure_url": "https://picsum.photos/id/1018/1200/800",
    "resource_type": "image",
    "file_name": "trek-view.jpg",
    "mime_type": "image/jpeg",
    "size_bytes": 284_311,
    "width": 1200,
    "height": 800,
}
SAMPLE_PDF = {
    "public_id": "seed/q3-roadmap",
    "secure_url": "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    "resource_type": "raw",
    "file_name": "Q3-roadmap.pdf",
    "mime_type": "application/pdf",
    "size_bytes": 13_264,
    "width": None,
    "height": None,
}

# A script is a list of lines. "---" starts a new chat session on a later day.
# A line is (sender, text) or (sender, text, options):
#   reply=-N   quote the message N lines earlier      react={"a": "❤️"}   reactions
#   system=True   a group notice                       attach=SAMPLE_IMAGE / SAMPLE_PDF
Line = Any


@dataclass
class Chat:
    members: list[str]
    script: list[Line]
    name: str | None = None
    description: str | None = None
    admins: list[str] = field(default_factory=list)
    # last N incoming messages stay unread for these users (shows unread badges)
    unread: dict[str, int] = field(default_factory=dict)
    # last N messages were never delivered (recipient "offline")
    undelivered: int = 0
    # last N messages delivered but not read
    unread_by_all: int = 0
    # member key -> index of the session in which they were added to the group
    late_joiners: dict[str, int] = field(default_factory=dict)


DIRECT_CHATS = [
    Chat(
        ["a", "p"],
        [
            ("p", "Hey! Are we still on for the design review tomorrow?"),
            ("a", "Yes, 11am works. I'll book the small room"),
            ("p", "Perfect 👍"),
            "---",
            ("a", "Pushed the new onboarding flow to staging"),
            ("p", "Ooh checking now"),
            ("p", "The OTP screen looks so clean"),
            ("a", "Thanks! Took way too long to get the auto-advance right 😅"),
            ("p", "Worth it", {"react": {"a": "❤️"}}),
            "---",
            ("p", "Lunch today?"),
            ("a", "Can't, stuck in a call till 2"),
            ("p", "No worries, tomorrow then"),
            ("a", "Deal. That new dosa place?", {"react": {"p": "👍"}}),
            "---",
            ("a", "Morning! Standup moved to 10:30 today"),
            ("p", "Thanks for the heads up"),
            ("p", "Also, did legal approve the privacy copy?"),
            ("a", "Yes, with one change to the read receipts wording"),
            ("p", "What change?"),
            ("a", '"If you turn off read receipts, you won\'t see them from others either"'),
            ("p", "Makes sense, it's reciprocal", {"reply": -1}),
            "---",
            ("p", "Did you see the feedback from the user interviews?"),
            ("a", "Skimmed it. People really want message reactions"),
            ("p", "Yep, top request by far", {"reply": -1}),
            ("a", "I'll scope it this sprint"),
            "---",
            ("p", "Also can you send me the slides from Monday?"),
            ("p", "Need them for the investor update 🙏"),
            ("p", "No rush, by evening is fine"),
        ],
        unread={"a": 3},
    ),
    Chat(
        ["a", "r"],
        [
            ("r", "Bro trek this weekend? Nandi hills sunrise"),
            ("a", "I'm in! What time?"),
            ("r", "Leaving 3:30am 😬"),
            ("a", "Ugh. Fine. Pick me up?"),
            ("r", "Yup, be downstairs"),
            "---",
            ("r", "That sunrise was unreal"),
            ("a", "Totally worth waking up at 3"),
            ("r", "Sending you the pics in the group"),
            "---",
            ("a", "Did you fix your bike?"),
            ("r", "Not yet, mechanic says Thursday"),
            ("a", "Take mine if you need it"),
            ("r", "You're a legend 🙌", {"react": {"a": "😂"}}),
            "---",
            ("r", "Match tonight at mine?"),
            ("a", "India vs Australia? Obviously"),
            ("r", "Bring snacks"),
            ("a", "On it"),
            "---",
            ("r", "What a finish!!! 🏏"),
            ("a", "Last over drama as usual"),
            ("r", "My heart can't take this"),
            ("a", "Same time next match?"),
            ("r", "Obviously"),
        ],
    ),
    Chat(
        ["a", "an"],
        [
            ("an", "Hi Aarav! Could you review my PR when you get a chance?"),
            ("a", "Sure, link?"),
            ("an", "#482 — the websocket reconnect fix"),
            ("a", "Looks good, left two small comments"),
            ("an", "Thanks! Fixed both"),
            ("a", "Approved ✅ Merging after CI"),
            ("an", "CI is green 🎉"),
            ("a", "Merged!"),
            "---",
            ("an", "Concert on Saturday, want to come? It's a Carnatic fusion thing"),
            ("a", "That sounds amazing, count me in"),
            ("an", "Yay! I'll get the tickets 🎶"),
            ("a", "What time does it start?"),
            ("an", "7pm at Chowdiah Memorial Hall"),
            ("a", "I'll be there by 6:45"),
            "---",
            ("a", "How was the concert prep?"),
            ("an", "Nervous but excited"),
            ("a", "You'll be great!", {"react": {"an": "🙏"}}),
            "---",
            ("an", "Thank you for coming yesterday!"),
            ("an", "It meant a lot ❤️"),
        ],
        unread={"a": 2},
    ),
    Chat(
        ["a", "e"],
        [
            ("e", "Hey, it's Emily from the conference!"),
            ("a", "Hi Emily! Great to hear from you"),
            ("e", "Loved your talk on real-time systems"),
            ("a", "Thank you! Your question about backpressure was great"),
            "---",
            ("e", "Any recommendations for weekend trips from Bengaluru?"),
            ("a", "Coorg for coffee estates, Hampi for ruins"),
            ("a", "Mysore if you want a day trip"),
            ("e", "Hampi it is! 🏛️"),
            "---",
            ("e", "Back from Hampi. Absolutely stunning"),
            ("a", "Told you! Did you do the coracle ride?"),
            ("e", "Yes! Slightly terrifying 😂"),
            ("a", "Haha that's the best part"),
            ("e", "I also tried the banana pancakes at the riverside cafe"),
            ("a", "Mango Tree? Classic"),
            ("e", "That one! 🥞"),
            ("a", "Let's grab coffee next week and you can tell me everything"),
        ],
        unread_by_all=1,
    ),
    Chat(
        ["a", "d"],
        [
            ("d", "Hola Aarav! Photos from the shoot are ready"),
            ("a", "Amazing, can't wait to see them"),
            ("d", "Uploading tonight 📷"),
            ("a", "Which camera did you use?"),
            ("d", "Fuji X-T4 with the 35mm"),
            ("a", "Love that lens"),
            "---",
            ("a", "These are incredible Diego"),
            ("d", "Gracias! The golden hour helped a lot"),
            "---",
            ("a", "Can I use two of them for my blog?"),
            ("a", "Will credit you of course"),
        ],
        undelivered=2,
    ),
    Chat(
        ["a", "v"],
        [
            ("v", "Aarav, do you have the landlord's number?"),
            ("a", "Yes, sending it"),
            ("a", "+91 98450 12345"),
            ("v", "Thanks"),
            "---",
            ("v", "Rent due on the 5th right?"),
            ("a", "Yes"),
            ("v", "Done, transferred my share"),
            ("a", "👍"),
            "---",
            ("v", "Plumber is coming at 10 tomorrow"),
            ("a", "Okay, I'll be working from home"),
            ("v", "Can you let him in? I have office"),
            ("a", "Sure"),
            "---",
            ("a", "Plumber fixed the kitchen tap"),
            ("v", "Finally! How much?"),
            ("a", "₹800, I paid"),
            ("v", "Sending you 400"),
            ("a", "Got it, thanks"),
        ],
    ),
    Chat(
        ["p", "s"],
        [
            ("s", "Priya! The new mockups are up"),
            ("p", "Looking now"),
            ("p", "I love the dark mode palette"),
            ("s", "Near-black, not pure black. Easier on the eyes"),
            "---",
            ("p", "Can we move our sync to Thursday?"),
            ("s", "Sure, same time?"),
            ("p", "Yes, thanks!"),
            "---",
            ("s", "Quick question: should the chat list show a preview of photos?"),
            ("p", "Yes, like Signal: a small 'Photo' label"),
            ("s", "Got it, and files say 'File'?"),
            ("p", "Exactly", {"reply": -1}),
            ("s", "Updating the spec"),
            "---",
            ("s", "Spec v2 is ready for review"),
            ("p", "Reading it tonight"),
            ("s", "No rush 🙂"),
        ],
    ),
    Chat(
        ["p", "m"],
        [
            ("m", "Hi Priya, the analytics dashboard is ready for review"),
            ("p", "Great, thanks Mei!"),
            ("m", "Retention is up 4% this month"),
            ("p", "That's huge 🎉", {"react": {"m": "🎉"}}),
            "---",
            ("m", "Can you share the Q3 OKRs doc?"),
            ("p", "Shared it with you"),
            ("m", "Got it, thanks"),
            "---",
            ("m", "Are you joining the offsite in Goa?"),
            ("p", "Wouldn't miss it 🏖️"),
            ("m", "Same! Let's room together?"),
            ("p", "Yes please"),
            ("m", "Booking it now"),
        ],
    ),
]

GROUP_CHATS = [
    Chat(
        ["a", "p", "r", "an", "v", "s", "d"],
        [
            ("a", "created the group “Weekend Trek 🏔️”", {"system": True}),
            (
                "a",
                "added Priya Patel, Rohan Mehta, Ananya Iyer, Vikram Singh, Sara Khan and Diego Alvarez",
                {"system": True},
            ),
            ("a", "Okay team, trek planning starts now!"),
            ("r", "Finally 🙌"),
            ("p", "Where are we thinking?"),
            ("a", "Skandagiri or Kunti Betta"),
            ("v", "Kunti Betta has the better night trek"),
            ("an", "+1 for Kunti Betta"),
            ("s", "I'm new to trekking, is it beginner friendly?"),
            ("r", "Totally, it's about 2 hours up", {"reply": -1}),
            ("s", "Then I'm in!", {"react": {"a": "🎉", "r": "👍", "p": "❤️"}}),
            "---",
            ("a", "made Priya Patel an admin", {"system": True}),
            ("p", "Booking a tempo traveller for 7 people"),
            ("d", "Can I bring my camera gear? Need a bit of extra space"),
            ("p", "Of course!"),
            ("v", "What should we pack?"),
            ("r", "Headlamp, 2L water, snacks, rain jacket"),
            ("an", "And mosquito repellent 🦟"),
            ("v", "Noted"),
            ("d", "Should we carry a tent for the top?"),
            ("r", "No camping allowed up there anymore"),
            ("d", "Ah okay, just snacks then"),
            ("s", "I'll bring homemade chakli 😋", {"react": {"r": "😋", "an": "❤️", "v": "🔥"}}),
            "---",
            ("p", "Tempo booked! ₹1200 per person"),
            ("a", "Sending now"),
            ("r", "Paid"),
            ("s", "Paid ✅"),
            ("d", "Paid"),
            ("an", "Done!"),
            ("v", "Will pay tonight"),
            ("p", "Thanks everyone 🙏", {"react": {"a": "👍", "an": "❤️"}}),
            "---",
            ("r", "Reminder: we leave at 9pm from Indiranagar"),
            ("s", "Can't wait!!"),
            ("d", "Weather looks clear 🌙"),
            ("a", "See you all there"),
            ("p", "Everyone carry ID please, there's a forest check post"),
            ("v", "Good call"),
            ("an", "On my way!"),
            ("r", "Reached Indiranagar, near the metro"),
            ("s", "5 min away 🏃‍♀️"),
            "---",
            (
                "d",
                "First batch of photos!",
                {"attach": SAMPLE_IMAGE, "react": {"a": "😮", "p": "❤️", "s": "❤️", "r": "🔥"}},
            ),
            ("p", "These are gorgeous Diego"),
            ("an", "Framing this one"),
            ("v", "Best trek ever"),
            ("s", "When's the next one? 😄"),
            ("r", "Next month, Kudremukh?", {"reply": -1}),
            ("a", "I'm in"),
            ("p", "In!"),
            ("d", "Count me in 📷"),
        ],
        name="Weekend Trek 🏔️",
        description="Planning our monthly treks around Bengaluru. Be on time!",
        admins=["a", "p"],
        unread={"a": 4, "p": 2},
    ),
    Chat(
        ["p", "a", "e", "l", "m"],
        [
            ("p", "created the group “Product Team”", {"system": True}),
            ("p", "added Aarav Sharma, Emily Carter, Lucas Fischer and Mei Lin Chen", {"system": True}),
            ("p", "Welcome everyone! This is our async channel for the launch"),
            ("l", "Hallo! 👋"),
            ("e", "Hi all"),
            ("m", "Hello!"),
            ("a", "Hey team"),
            ("p", "Quick intro round: name + what you're working on"),
            ("l", "Lucas, WebSocket gateway + presence"),
            ("e", "Emily, design system and the chat screens"),
            ("m", "Mei, analytics and the metrics pipeline"),
            ("a", "Aarav, messaging core: send, receipts, sync"),
            "---",
            ("p", "Q3 roadmap attached, please review before Friday", {"attach": SAMPLE_PDF}),
            ("l", "Reviewed. The API timeline looks tight"),
            ("p", "Which part?", {"reply": -1}),
            ("l", "Message search. Full-text in SQLite needs FTS5, which is fine, but migrations take time"),
            ("a", "We could ship search in v1.1"),
            ("p", "Agreed. Let's cut it from v1"),
            ("m", "I'll update the tracking plan"),
            "---",
            ("e", "Design QA notes for the chat screen:"),
            (
                "e",
                "1. Timestamp should sit inside the bubble\n"
                "2. Tighter corners for consecutive messages\n"
                "3. Date dividers need more padding",
            ),
            ("a", "All three fixed in the latest build"),
            ("e", "Amazing, thank you! 🙌", {"react": {"a": "❤️", "p": "👍"}}),
            "---",
            ("m", "Daily actives up 12% after the reactions launch"),
            ("p", "🎉🎉🎉"),
            ("l", "Nice! Websocket server is holding up fine"),
            ("a", "p99 latency for message ack is ~40ms"),
            ("p", "Great work everyone", {"react": {"l": "🎉", "m": "🎉", "e": "❤️"}}),
            "---",
            ("l", "Heads up: deploying the receipts fix at 6pm"),
            ("a", "👍"),
            ("m", "Will watch the dashboards"),
            ("l", "Deployed, all green ✅"),
            ("p", "Retro on Friday, add your notes to the doc"),
            ("e", "Added mine"),
            ("m", "Done"),
            ("l", "Added. Mostly about flaky e2e tests 🙃"),
            ("a", "I'll pair with you on those next week", {"reply": -1}),
            ("l", "Danke!"),
        ],
        name="Product Team",
        description="Launch coordination. Async first.",
        admins=["p"],
        unread={"a": 2},
    ),
    Chat(
        ["r", "a", "an", "s"],
        [
            ("r", "created the group “Bangalore Foodies 🍛”", {"system": True}),
            ("r", "added Aarav Sharma and Ananya Iyer", {"system": True}),
            ("r", "Mission: try every dosa place in the city"),
            ("an", "Starting with CTR Malleshwaram, obviously"),
            ("a", "The benne masala there 🤤"),
            ("r", "Sunday 8am?"),
            ("an", "Yes"),
            ("a", "Yes"),
            "---",
            ("r", "added Sara Khan", {"system": True}),
            ("s", "Thanks for adding me! I have a list of places 📝"),
            ("r", "Share!"),
            ("s", "Vidyarthi Bhavan, Brahmin's Coffee Bar, Rameshwaram Cafe, Veena Stores"),
            ("an", "Veena Stores idlis are the best", {"reply": -1}),
            ("a", "Rameshwaram Cafe this weekend?"),
            ("r", "Long queue but worth it"),
            "---",
            ("s", "Rameshwaram was SO good"),
            ("a", "Ghee podi idli 🙌", {"react": {"s": "😋", "an": "😋"}}),
            ("r", "Next: Vidyarthi Bhavan"),
            ("an", "I'll be there"),
            ("s", "Me too!"),
            ("a", "Saturday 8am? Before the crowd"),
            ("r", "Saturday it is"),
        ],
        name="Bangalore Foodies 🍛",
        description="Dosas, idlis, and filter coffee",
        admins=["r"],
        unread={"a": 1},
        late_joiners={"s": 1},
    ),
]


def _split_sessions(script: list[Line]) -> list[list[Line]]:
    sessions: list[list[Line]] = [[]]
    for line in script:
        if line == "---":
            sessions.append([])
        else:
            sessions[-1].append(line)
    return [s for s in sessions if s]


def _schedule(rng: random.Random, n_sessions: int, now: datetime, end_days_ago: int) -> list[datetime]:
    """Spread chat sessions from 9 days ago up to `end_days_ago`, never in the future."""
    starts = []
    span = 9 - end_days_ago
    for i in range(n_sessions):
        days_ago = 9 - round(i * span / max(n_sessions - 1, 1))
        day = (now - timedelta(days=days_ago)).replace(hour=0, minute=0, second=0, microsecond=0)
        # 03:00-15:59 UTC is roughly 8:30am-9:30pm in India
        start = day + timedelta(hours=rng.randint(3, 15), minutes=rng.randint(0, 59))
        if start > now - timedelta(minutes=75):  # leave room for the session's messages
            start = now - timedelta(minutes=rng.randint(75, 120))
        starts.append(max(start, starts[-1] + timedelta(hours=1)) if starts else start)
    return starts


def _create_chat(
    db: Session, users: dict[str, User], chat: Chat, rng: random.Random, now: datetime, end_days_ago: int
) -> int:
    sessions = _split_sessions(chat.script)
    starts = _schedule(rng, len(sessions), now, end_days_ago)
    conv_start = starts[0] - timedelta(minutes=5)
    is_group = chat.name is not None
    conv = Conversation(
        type="group" if is_group else "direct",
        name=chat.name,
        description=chat.description,
        created_by=users[chat.members[0]].id,
        created_at=conv_start,
        last_message_at=conv_start,
    )
    db.add(conv)
    db.flush()

    # Members listed in late_joiners join at the start of that session (when "added X" is posted).
    joined_at = {
        k: starts[chat.late_joiners[k]] if k in chat.late_joiners else conv_start for k in chat.members
    }

    members = {
        k: ConversationMember(
            conversation_id=conv.id,
            user_id=users[k].id,
            role="admin" if k in chat.admins else "member",
            joined_at=joined_at[k],
        )
        for k in chat.members
    }
    db.add_all(members.values())

    created: list[tuple[str, Message]] = []
    for session, start in zip(sessions, starts, strict=True):
        t = start
        for line in session:
            sender_key, text = line[0], line[1]
            opts: dict[str, Any] = line[2] if len(line) > 2 else {}
            is_system = bool(opts.get("system"))
            body = f"{users[sender_key].display_name} {text}" if is_system else text
            msg = Message(
                conversation_id=conv.id,
                sender_id=users[sender_key].id,
                client_id=f"seed-{uuid.uuid4()}",
                type="system" if is_system else "text",
                body=body,
                created_at=t,
            )
            if "attach" in opts:
                msg.type = "image" if opts["attach"]["resource_type"] == "image" else "file"
                msg.body = ""
                msg.attachments = [Attachment(**opts["attach"])]
            if "reply" in opts:
                msg.reply_to = created[len(created) + opts["reply"]][1]
            db.add(msg)
            db.flush()
            for reactor, emoji in opts.get("react", {}).items():
                db.add(
                    Reaction(
                        message_id=msg.id,
                        user_id=users[reactor].id,
                        emoji=emoji,
                        created_at=t + timedelta(minutes=1),
                    )
                )
            if not is_system:
                # Receipts for every member who could see it; everything read by default.
                for key in chat.members:
                    if key != sender_key and joined_at[key] <= t:
                        db.add(
                            MessageReceipt(
                                message_id=msg.id,
                                user_id=users[key].id,
                                delivered_at=t + timedelta(seconds=2),
                                read_at=t + timedelta(minutes=1),
                            )
                        )
            created.append((sender_key, msg))
            t += timedelta(minutes=rng.randint(1, 4), seconds=rng.randint(0, 59))
        conv.last_message_at = t - timedelta(seconds=30)
    db.flush()

    # Leave some messages unread / undelivered so the demo shows badges and every tick state.
    real = [(k, m) for k, m in created if m.type != "system"]
    for key, n in chat.unread.items():
        incoming = [m for k, m in real if k != key][-n:]
        for m in incoming:
            for r in m.receipts:
                if r.user_id == users[key].id:
                    r.read_at = None
    for _k, m in real[-chat.undelivered :] if chat.undelivered else []:
        for r in m.receipts:
            r.read_at = None
            r.delivered_at = None
    for _k, m in real[-chat.unread_by_all :] if chat.unread_by_all else []:
        for r in m.receipts:
            r.read_at = None
    db.flush()

    # Read pointer = newest message this member sent or has read.
    for key, member in members.items():
        uid = users[key].id
        read_ids = [
            m.id for k, m in created if k == key or any(r.user_id == uid and r.read_at for r in m.receipts)
        ]
        member.last_read_message_id = max(read_ids) if read_ids else None
    return len(created)


def seed(db: Session) -> None:
    rng = random.Random(42)  # deterministic timestamps
    now = utcnow()
    users: dict[str, User] = {}
    for key, (name, phone, username, about, avatar) in USERS.items():
        user = User(
            phone=phone,
            username=username,
            display_name=name,
            about=about,
            avatar_url=avatar,
            avatar_color=avatar_color_for(phone),
            created_at=now - timedelta(days=30),
            last_seen_at=now - timedelta(minutes=rng.randint(5, 600)),
        )
        db.add(user)
        users[key] = user
    db.flush()

    for owner, keys in CONTACTS.items():
        for key in keys:
            db.add(
                Contact(
                    owner_id=users[owner].id, contact_id=users[key].id, created_at=now - timedelta(days=20)
                )
            )

    # How many days ago each chat went quiet, so the chat list shows a mix of times and dates.
    end_days = [0, 1, 0, 2, 4, 3, 1, 6, 0, 0, 1]
    total = 0
    for chat, end_days_ago in zip(DIRECT_CHATS + GROUP_CHATS, end_days, strict=True):
        total += _create_chat(db, users, chat, rng, now, end_days_ago)
    db.commit()
    print(
        f"Seeded {len(users)} users, {len(DIRECT_CHATS)} direct chats, "
        f"{len(GROUP_CHATS)} groups, {total} messages."
    )


def print_logins() -> None:
    print(f"Demo logins (OTP for every account: {get_settings().fixed_otp}):")
    for name, phone, *_ in USERS.values():
        print(f"  {phone}  {name}")


def seed_if_empty() -> bool:
    with SessionLocal() as db:
        if db.scalar(select(func.count(User.id))):
            return False
        seed(db)
    print_logins()
    return True


def reset() -> None:
    with SessionLocal() as db:
        for table in reversed(Base.metadata.sorted_tables):
            db.execute(delete(table))
        db.commit()


if __name__ == "__main__":
    from app.main import run_migrations

    run_migrations()
    if "--reset" in sys.argv:
        reset()
    if not seed_if_empty():
        print("Database already has data; nothing to do (use --reset to start over).")
        print_logins()
