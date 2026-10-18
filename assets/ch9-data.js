/* Chapter 9 — Computer Networks
   Quiz + exercises data, rendered by assets/course.js. Exercises 1–2 follow textbook §2.8; 3–5 use the Packet Journey lab. */
window.CHAPTER_DATA = {
  "id": 9,
  "quiz": [
    {
      "q": "What is the basic purpose of joining computers into a network?",
      "opts": [
        "Making every connected computer run the same programs at exactly the speed of the fastest machine in it",
        "Letting separate devices share resources and exchange information despite the distance between them",
        "Replacing each computer's own memory and processor with one central CPU that every device borrows in turn",
        "Guaranteeing that no data can ever be lost, copied or read by another computer that is on the same cable"
      ],
      "a": 1,
      "why": "A network removes distance as an obstacle: devices keep their own CPU and memory but cooperate and share resources and information."
    },
    {
      "q": "A school computer lab with 30 PCs joined by one switch in a single room is best described as a",
      "opts": [
        "PAN, because every computer in it is owned and used by one single person only",
        "MAN, because a school is an organisation that normally spreads over a whole city",
        "WAN, because more than a few computers are connected to each other at the same time",
        "LAN, because it covers a small area such as a room or building"
      ],
      "a": 3,
      "why": "LAN = local area network: a home, school, lab or office building. PAN is a few metres around one person, MAN a city (up to ~50 km), WAN a country or the globe."
    },
    {
      "q": "Which statement about the client–server architecture is true?",
      "opts": [
        "The server is always on with a permanent address, and clients do not talk directly to each other",
        "Every client also acts as a server for the other clients and must therefore keep a fixed IP address",
        "Clients must stay connected all the time, while the server may be switched off whenever it is idle",
        "Clients exchange files directly among themselves and use the server only to store their login names"
      ],
      "a": 0,
      "why": "In client–server the server is an always-on host with a permanent IP; clients may connect intermittently, may have changing addresses, and only talk to the server."
    },
    {
      "q": "What is the biggest weakness of a pure client–server system?",
      "opts": [
        "Each new client needs its own server, so the cost grows with exactly the number of users it has",
        "Clients cannot be protected, because all the data must be copied to every one of the client computers",
        "The server is a single point of failure: if it stops, every client loses the service",
        "The system cannot be backed up, since the data is spread over thousands of unreliable peer computers"
      ],
      "a": 2,
      "why": "Central control makes management, security and backup easy, but everything depends on one machine (or farm). Peer-to-peer trades this for harder management."
    },
    {
      "q": "Why do peer-to-peer systems scale so well when more users join?",
      "opts": [
        "A peer-to-peer network upgrades its central server automatically each time that another user joins",
        "Peers have permanent IP addresses, which makes routing between them much faster than with a server",
        "Peer-to-peer traffic is exempt from bandwidth limits because it never travels over the Internet",
        "Each new peer is both a client and a server, so it adds capacity as well as demand"
      ],
      "a": 3,
      "why": "Every peer brings its own upload capacity, so capacity grows with the number of users. The price is that the network is hard to manage and secure."
    },
    {
      "q": "Why did the local network designers stop using hubs and switch to switches?",
      "opts": [
        "A hub works at the application layer and cannot copy signals, whereas a switch can amplify any signal that arrives at it",
        "A hub copies every signal to all ports in one shared collision domain; a switch forwards only to the right port",
        "A hub reads the destination IP address of each packet, which is slower than the MAC address lookup done by a switch",
        "A switch is the only device that can connect more than two computers, because a hub has just two ports to plug cables into"
      ],
      "a": 1,
      "why": "A hub is a layer-1 repeater: every device hears everything and shares one collision domain. A switch learns MAC addresses and sends each frame only to the right port."
    },
    {
      "q": "A frame arrives at a switch. What does the switch use to choose the output port?",
      "opts": [
        "The destination IP address, looked up in a routing table that it shares with the neighbouring routers",
        "The destination port number, which tells it which application on the receiving computer wants the data",
        "The destination MAC address, looked up in its learned address table",
        "The domain name inside the HTTP request, which it asks the DNS server to turn into a hardware address"
      ],
      "a": 2,
      "why": "A switch is a layer-2 device: it learns which MAC address lives behind which port (its CAM table). Reading IP addresses is the job of a router."
    },
    {
      "q": "Which device reads the destination IP address of each packet and chooses the next hop towards it?",
      "opts": [
        "A router",
        "A repeater, because it receives every signal and decides where the signal should go next",
        "A switch, because it connects the devices of one LAN and inspects each address in the packet",
        "A hub, because it keeps a table that tells it which cable leads to each of the networks"
      ],
      "a": 0,
      "why": "Routing — choosing a path by IP address, with a routing table — is the network layer's job and the router's trade. Hubs and repeaters see only signals; switches see only MAC addresses."
    },
    {
      "q": "A remote employee needs safe access to the company's internal network over the public Internet. Which technology fits best?",
      "opts": [
        "An IDS, which blocks all incoming traffic that comes from computers outside of the building",
        "A VPN, which builds an encrypted tunnel to the internal network",
        "A hub, which copies the employee's traffic onto the company's private cables at the office",
        "A gateway, which translates the employee's traffic into a different protocol and a new format"
      ],
      "a": 1,
      "why": "A virtual private network creates a secure private connection across the public Internet. A firewall filters, an IDS detects attacks; neither creates the tunnel."
    },
    {
      "q": "In a star topology the central switch fails. What is the effect?",
      "opts": [
        "Only the devices in the same row as the switch lose their connection while the others keep working",
        "Nothing happens, because every device in a star is also wired directly to all of the other devices",
        "The whole network goes down, whereas a broken cable to one device would isolate only that device",
        "The network keeps running but slower, because the data automatically travels around the ring instead"
      ],
      "a": 2,
      "why": "Star = easy to manage, but the centre is a single point of failure. A mesh offers several paths but costs far more cabling."
    },
    {
      "q": "How many direct links does a full mesh of 6 devices need?",
      "opts": [
        "15, because 6 × 5 / 2 links are needed",
        "30, because each of the six devices links to the five others and every link counts twice",
        "6, because each device needs just one link to be connected to the rest of the network",
        "36, because each of the six devices needs a separate link to all six devices, itself included"
      ],
      "a": 0,
      "why": "A full mesh of n devices needs n(n−1)/2 links: 6·5/2 = 15. That quadratic growth is why meshes are used only where reliability justifies the cost."
    },
    {
      "q": "Which of these addresses cannot be used directly on the public Internet?",
      "opts": [
        "24.5.6.7, because its first number is smaller than 172 and so it is reserved for local networks",
        "131.1.2.3, because addresses with three different digits in the last number are only for routers",
        "81.10.20.30, because an address that is written with four numbers is valid only on one LAN",
        "172.20.4.9, which lies in the private range 172.16.0.0–172.31.255.255"
      ],
      "a": 3,
      "why": "Private ranges are 10.x.x.x, 172.16–31.x.x and 192.168.x.x. Routers on the Internet do not forward them; NAT lets such hosts reach the outside."
    },
    {
      "q": "How can ten devices in a home, each with a private address, all use the Internet through one public address?",
      "opts": [
        "The ISP gives each device a temporary public address that expires when the device is switched off",
        "DNS converts the ten private addresses into one public address each time that a name is looked up",
        "The router performs NAT, rewriting each outgoing packet to use its single public address",
        "The switch copies the public address into the headers of every frame that the devices send to it"
      ],
      "a": 2,
      "why": "Network address translation: the router replaces the private source address by its public one and remembers which device each reply belongs to."
    },
    {
      "q": "What does DNS do when you type www.example.com into a browser?",
      "opts": [
        "It translates the name into the IP address that the browser needs for the connection",
        "It downloads the web page from the nearest server and sends it to the browser in small packets",
        "It encrypts the request so that nobody on the way to the web server can read the page you asked for",
        "It chooses the cable or radio channel on which the web server's reply will travel back to your device"
      ],
      "a": 0,
      "why": "DNS is the Internet's phone book: it turns human-friendly names into numeric IP addresses. The page itself is fetched afterwards with HTTP."
    },
    {
      "q": "An uncached lookup for www.example.com is made by a recursive resolver. In which order does it contact servers?",
      "opts": [
        "Authoritative server for example.com, then the .com server, then the root server at the end",
        "Root server, then the .com server, then the authoritative server for example.com",
        "The .com server, then a root server, then the web server that hosts the page itself",
        "Root server, then the authoritative server for example.com, then finally the .com server"
      ],
      "a": 1,
      "why": "The hierarchy is read from the right: the root points to the TLD (.com), the TLD points to the zone's authoritative server, which owns the answer."
    },
    {
      "q": "A resolver answered a lookup for www.example.com one minute ago with a TTL of 300 seconds. What happens on the next request for the same name?",
      "opts": [
        "The resolver always repeats the full walk, because caching a DNS answer is not allowed by the standard",
        "The resolver sends the question straight to the web server, since it already knows the server exists",
        "The resolver answers from its cache but first asks the root server for permission to reuse the answer",
        "The resolver answers from its cache without asking the root, TLD or authoritative servers"
      ],
      "a": 3,
      "why": "Answers may be cached for their TTL, which is why most lookups never reach the root servers."
    },
    {
      "q": "A browser reports 'server not found' for www.exmaple.com, but pasting the correct server's IP address into the address bar works. The most likely cause is that",
      "opts": [
        "the misspelt name has no DNS record, so no IP address can be found for it",
        "the web server is switched off, so the TCP connection attempt to it keeps timing out forever",
        "the router has run out of public addresses, so it refuses to forward packets to the Internet",
        "the switch has lost its address table, so it can no longer deliver frames to the right port"
      ],
      "a": 0,
      "why": "Reaching the server by IP proves the network works; the failure is in DNS (NXDOMAIN). With no address the browser never even opens a TCP connection."
    },
    {
      "q": "Which OSI layers are merged into the single application layer of the TCP/IP model?",
      "opts": [
        "Application, transport and network, because these three are all implemented in the user's software",
        "Physical and data link, because they are both implemented in the hardware of the network card",
        "Session, presentation and application",
        "Transport, network and data link, because they are all handled by the operating system itself"
      ],
      "a": 2,
      "why": "TCP/IP has four layers: application (OSI 5–7), transport, internet (= network) and network interface (= data link + physical)."
    },
    {
      "q": "Which layer is responsible for end-to-end delivery between two programs and for recovering lost segments?",
      "opts": [
        "The network layer, because IP guarantees that every packet that was sent will eventually arrive",
        "The transport layer (TCP)",
        "The link layer, because Ethernet resends any frame that was lost anywhere between the two hosts",
        "The physical layer, because it knows by electrical measurement which bits have been corrupted"
      ],
      "a": 1,
      "why": "IP only makes a best effort to deliver packets. TCP (transport) numbers segments, acknowledges them and retransmits missing ones."
    },
    {
      "q": "A web server sends a response. In which order are headers added as the data goes down its protocol stack?",
      "opts": [
        "Ethernet header, then IP header, then TCP header, because the outermost layer is wrapped first",
        "IP header, then TCP header, then Ethernet header, because the address is added before the ports",
        "TCP header, then Ethernet header and trailer, then IP header, because frames are built before packets",
        "TCP header, then IP header, then Ethernet header and trailer"
      ],
      "a": 3,
      "why": "Each layer wraps what it receives from above: transport (segment), network (packet), link (frame). The receiver unwraps in the reverse order."
    },
    {
      "q": "Which application is the best fit for UDP rather than TCP?",
      "opts": [
        "A bank transfer, because every single byte must arrive exactly once and in the correct order",
        "Downloading a program installer, since a missing byte would make the file useless to the user",
        "A live video call, where a late packet is worthless and speed matters more than perfection",
        "Sending an e-mail with an attachment, as every part of the message has to reach the destination"
      ],
      "a": 2,
      "why": "UDP does not retransmit or reorder, which is its advantage when old data is useless. Transfers that must be exact use TCP."
    },
    {
      "q": "In the TCP three-way handshake, what is the second message?",
      "opts": [
        "SYN + ACK from the server, which acknowledges the client's number and announces its own",
        "ACK from the client, which confirms that the server's reply has arrived without any damage",
        "SYN from the client, which asks the server to open a connection on the port in the URL",
        "FIN from the server, which tells the client that the server has no more data to send to it"
      ],
      "a": 0,
      "why": "SYN (client) → SYN+ACK (server) → ACK (client). Afterwards both sides know each other's starting sequence numbers and the connection is established."
    },
    {
      "q": "In the URL http://www.example.com:8080/docs/a.html?x=1, which part is the path?",
      "opts": [
        "www.example.com:8080, which names both the computer and the port to which it must connect",
        "?x=1, which tells the server which page to send back to the browser in the response message",
        "http, which tells the browser which protocol to use to fetch the resource that is named after it",
        "/docs/a.html"
      ],
      "a": 3,
      "why": "scheme = http, host = www.example.com, port = 8080, path = /docs/a.html, query = ?x=1."
    },
    {
      "q": "A web server replies 'HTTP/1.1 404 Not Found'. What does this tell the browser?",
      "opts": [
        "The DNS server could not turn the host name into an IP address, so no connection was made",
        "The server was reached and works, but it has nothing stored at the requested path",
        "The server crashed while it was running its program and is therefore unable to answer at all",
        "The requested page has moved to another address that is given in the Location header field"
      ],
      "a": 1,
      "why": "4xx codes mean the request was at fault. 404 = nothing at that path; a failed DNS lookup would never produce an HTTP response at all, and a move would be 301."
    },
    {
      "q": "Read this request. Which statement about it is correct?",
      "code": "GET /docs/intro.html HTTP/1.1\nHost: www.example.org\nAccept: text/html",
      "opts": [
        "It asks the server for the resource /docs/intro.html of the site www.example.org without sending any body",
        "It sends the data in the Host line to the server and asks the server to store it as /docs/intro.html",
        "It asks a DNS server for the address of www.example.org, version 1.1 of the DNS being used for the query",
        "It was sent over a connection that was encrypted with TLS, because it names HTTP version 1.1 in the first line"
      ],
      "a": 0,
      "why": "GET reads a resource. Request line = method, path, version; Host names the site on that server. Plain HTTP/1.1 is not encrypted (HTTPS would be)."
    },
    {
      "q": "A link has MTU 1500 bytes. An IPv4 datagram carries 4000 bytes of data after its 20-byte header. How many fragments are needed (each with its own 20-byte header; fragment data sizes are multiples of 8 except the last)?",
      "opts": [
        "2 fragments: 2000 + 2000 bytes of data, since each fragment may carry half of the datagram",
        "4 fragments: 1500 bytes in each of the first three, then 1000 bytes of data in the last one",
        "3 fragments: 1480 + 1480 + 1040 bytes of data",
        "3 fragments: 1500 + 1500 + 1000 bytes of data, because the header does not count against the MTU"
      ],
      "a": 2,
      "why": "The MTU limits header + data to 1500, so each fragment holds at most 1500 − 20 = 1480 data bytes (a multiple of 8). 4000 = 1480 + 1480 + 1040, so three fragments."
    },
    {
      "q": "A 150 MB file is sent over a 100 Mbps link running at full speed. About how long does it take?",
      "opts": [
        "1.5 seconds, because 150 divided by 100 gives the number of seconds the transfer takes",
        "12 seconds, because 150 MB = 1200 megabits and 1200 / 100 = 12",
        "15 seconds, because the file size in megabytes is divided by the link speed of ten per second",
        "120 seconds, because each megabyte needs eight whole seconds on a link of that capacity"
      ],
      "a": 1,
      "why": "Bandwidth is in bits per second and file sizes are in bytes: 150 MB × 8 = 1200 Mb, and 1200 Mb ÷ 100 Mbps = 12 s (best case)."
    },
    {
      "q": "Why does a self-driving car run its AI model on board instead of in a faraway cloud data centre?",
      "opts": [
        "The cloud cannot run neural networks, so a faraway data centre is unable to process pictures at all",
        "On-board computers are always faster than data centres, no matter how large the model might be",
        "The law forbids any vehicle data from travelling over the Internet, even in a summarised form",
        "A cloud round trip is too slow for real-time decisions, and the raw data is too big to upload"
      ],
      "a": 3,
      "why": "Edge computing puts the computation near the sensors: lower latency, less bandwidth, and it keeps working when the connection is poor."
    }
  ],
  "exercises": [
    {
      "type": "text",
      "title": "How long does the file take? (textbook §2.8.2)",
      "brief": "Machines 1–4 form a diamond (textbook Figure 2.10): links 1–2, 1–3, 2–4, 3–4. Write the link types as four letters <code>ABCD</code> in that order. Teaching speeds from Table 2.1: <b>T</b> = 1000 MB/s, <b>D</b> (DSL) = 30 MB/s, <b>M</b> (modem) = 5 MB/s. (The textbook's worked sentence uses 26 MB/s for DSL; use the table's 30.) A file travels from machine 1 to machine 4 by <b>method 1</b> (whole file via machine 2, store-and-forward), <b>method 2</b> (whole file via machine 3) or <b>method 3</b> (split into two parts, one via each route in parallel, then merge). Splitting and merging cost 1 s per 50 MB, rounded up (so 260 MB costs 6 s). For a <b>260 MB</b> file on structures <code>TTDD</code> and <code>TMDD</code>: (a) time of methods 1 and 2; (b) the best whole-MB split for method 3 and its time; (c) which method wins and why. (d) Bonus: a real T1 line is 1.544 Mbps. How many MB/s is that?",
      "solutionText": "Time of one route = size/speed of first link + size/speed of second link.\n\nTTDD  (1-2 = T, 1-3 = T, 2-4 = D, 3-4 = D)\n  method 1: 260/1000 + 260/30 = 0.26 + 8.667 = 8.93 s\n  method 2: identical routes -> 8.93 s\n  method 3: 130 MB on each route: 130/1000 + 130/30 = 4.46 s in parallel, + 6 s split/merge = 10.46 s\n  Winner: method 1 (or 2) - the two routes are equally fast, so halving the data saves only 4.5 s while the split/merge costs 6 s.\n\nTMDD  (1-2 = T, 1-3 = M, 2-4 = D, 3-4 = D)\n  method 1: 260/1000 + 260/30 = 8.93 s\n  method 2: 260/5 + 260/30 = 52 + 8.667 = 60.67 s (the modem link is slow)\n  method 3: best split 227 MB via machine 2 and 33 MB via machine 3:\n            route 2: 227*(1/1000 + 1/30) = 7.79 s;  route 3: 33*(1/5 + 1/30) = 7.70 s\n            parallel time 7.79 s + 6 s overhead = 13.79 s\n  Winner: method 1 at 8.93 s. Splitting only pays off when the file is large enough that the saved transfer time exceeds the overhead (for example 2600 MB on TMDD: method 1 = 89.27 s, method 3 = 129.83 s - still not worth it because the second route is so slow).\n\n(d) 1.544 Mbit/s / 8 = 0.193 MB/s - the table's \"1000 MB/s\" is a teaching number, about 5000 times faster than a real T1 line. Always check bits versus bytes."
    },
    {
      "type": "text",
      "title": "Route more than 13 MB/s to the TV (textbook §2.8.3)",
      "brief": "A router R sends data to a TV (T) over hops between phones p1–p3 and tablets a4–a6. Maximum speeds in MB/s, one direction only (source → destination): <table class='tbl'><tr><th>from → to</th><th>speed</th></tr><tr><td>R → p1</td><td>10</td></tr><tr><td>R → a5</td><td>7</td></tr><tr><td>p1 → p2, p1 → p3</td><td>5, 5</td></tr><tr><td>p2 → p3, p2 → T</td><td>2, 6</td></tr><tr><td>p3 → a4</td><td>4</td></tr><tr><td>a4 → T</td><td>8</td></tr><tr><td>a5 → a4, a5 → a6</td><td>2, 8</td></tr><tr><td>a6 → a4, a6 → T</td><td>1, 3</td></tr></table> The textbook's sample plan delivers 13 MB/s (Figure 2.11). Find a plan that delivers more. Remember the TV accepts frames only from p2, a4 and a6 (MAC filter). Give the flow on each link and prove that you cannot do better.",
      "solutionText": "One plan that delivers 15 MB/s (flow on each link, MB/s):\n  R -> p1 9      R -> a5 6\n  p1 -> p2 5     p1 -> p3 4\n  p2 -> T 5      p3 -> a4 4\n  a5 -> a4 2     a5 -> a6 4\n  a6 -> a4 1     a6 -> T 3\n  a4 -> T 7\n\nCheck conservation at every node (in = out): p1 9 = 5+4; p2 5 = 5; p3 4 = 4; a4 4+2+1 = 7; a5 6 = 2+4; a6 4 = 1+3. No link exceeds its capacity, and T receives only from p2, a4 and a6: 5 + 7 + 3 = 15 MB/s.\n\nWhy not more: split the nodes into {R, p1, p3, a5, a6} and {p2, a4, T}. Every path from R to T must cross a link from the first group to the second: p1->p2 (5) + p3->a4 (4) + a5->a4 (2) + a6->a4 (1) + a6->T (3) = 15 MB/s. This 'cut' caps the flow at 15, so 15 is the maximum (the max-flow / min-cut theorem; routing algorithms such as Ford-Fulkerson find it)."
    },
    {
      "type": "text",
      "title": "Lab: how many DNS messages does a cache save?",
      "brief": "Open the Packet Journey lab. Use the URL <code>http://www.example.com/</code>. For each setting of <b>DNS caches</b> — nothing cached; resolver knows the TLD servers; resolver cached the name; this computer cached the name — press <b>Send it</b>, step through phase 2 · DNS, and count the <b>messages</b> that really cross the network (steps whose arrow joins two different boxes; the first step, “check the local cache”, sends nothing). Then run the story <b>Typo in the domain</b>. Which server answers NXDOMAIN, and how many steps does the whole journey have?",
      "solutionText": "Messages that cross the network (verified in the engine):\n  nothing cached ............ 8   (client->resolver, resolver->root, root->resolver, resolver->TLD, TLD->resolver, resolver->authoritative, authoritative->resolver, resolver->client)\n  resolver knows .com ....... 6   (the two root messages disappear, and so does the resolver's own cache-miss note)\n  resolver cached the name .. 2   (question and answer between your computer and the resolver)\n  this computer cached it ... 0   (no packet at all)\n\nTypo in the domain (www.exmaple.com): the .com TLD server answers NXDOMAIN, because the name exmaple.com was never registered. The journey has 8 steps in all (1 URL + 7 DNS) and phases 3-5 (TCP, HTTP, layers) are greyed out: with no IP address the browser never opens a connection."
    },
    {
      "type": "text",
      "title": "Lab: segments, MTU and header overhead",
      "brief": "Start the story <b>First visit</b> (GET, MTU 200) and go to phase 5 · Layers. (a) How many bytes is the HTTP response, and into how many TCP segments is it cut? List the data size of each. (b) Compute the total header and trailer overhead (TCP 20 + IP 20 + Ethernet 14 + 4 per frame) and the bytes on the wire. (c) Switch <b>Link MTU</b> to 1500 and press Send it again: what changes? (d) Select the last story, <b>UDP and IP fragments</b>: how many fragments, what are their payload sizes and offsets, and which fragment has the “more fragments” flag cleared?",
      "solutionText": "(a) The response is 619 bytes. With MTU 200 the MSS is 200 - 20 - 20 = 160, so TCP makes 4 segments carrying 160, 160, 160 and 139 bytes.\n(b) Each frame adds 20 + 20 + 14 + 4 = 58 bytes: 4 x 58 = 232 bytes of overhead. On the wire: 619 + 232 = 851 bytes (frames of 218, 218, 218 and 197 bytes).\n(c) With MTU 1500 the MSS is 1460, so the 619 bytes fit in ONE segment: overhead 58 bytes, 677 bytes on the wire. A bigger MTU means fewer headers for the same data.\n(d) The UDP datagram is 619 + 8 = 627 bytes. IP can carry at most floor((200 - 20)/8)*8 = 176 payload bytes per fragment, so there are 4 fragments with payloads 176, 176, 176 and 99, offsets 0, 22, 44 and 66 (in 8-byte units). Only the last one has more-fragments = no. If any fragment is lost, the whole datagram is lost - which is why TCP segments to the MSS instead."
    },
    {
      "type": "text",
      "title": "Lab: subnets for a computer room",
      "brief": "Use the subnet calculator at the bottom of the lab. (a) For <code>192.0.2.130/26</code>, what are the network and broadcast addresses and the usable host range? How many hosts? (b) Type <code>192.0.2.100</code> in the second box: can the two hosts talk without a router? (c) Cut <code>192.0.2.0/24</code> into four equal subnets: list their networks. (d) A room has 24 PCs: is a /27 enough? Is a /28? Check with the calculator.",
      "solutionText": "(a) Network 192.0.2.128, broadcast 192.0.2.191, usable hosts 192.0.2.129 - 192.0.2.190: 62 hosts (2^6 = 64 addresses minus the network and broadcast addresses).\n(b) No. A /26 groups addresses in blocks of 64: 192.0.2.100 is in the block 192.0.2.64 - 192.0.2.127, a different subnet, so traffic must go through the default gateway (a router).\n(c) Four equal subnets need 2 extra bits: /26. Networks 192.0.2.0/26, 192.0.2.64/26, 192.0.2.128/26 and 192.0.2.192/26, each with 62 usable hosts.\n(d) A /27 has 2^5 = 32 addresses, 30 usable: enough for 24 PCs with 6 to spare. A /28 has only 14 usable addresses - not enough."
    },
    {
      "type": "text",
      "title": "Write the request, predict the response",
      "brief": "(a) Write on paper the HTTP/1.1 request your browser sends for <code>http://www.example.org/docs/intro.html?lang=en</code> (request line plus the Host header). Which parts of the URL end up in the request line and which in the Host header? What would happen to a <code>#top</code> fragment added at the end? (b) The file does not exist: what is the first line of the response, and whose fault is it? What would the first line be if the site's own program crashed? (c) <b>Check in the lab</b>: send this URL with cache setting “nothing cached”. What does the DNS answer contain besides the address, and does the real status match your prediction?",
      "solutionText": "(a) GET /docs/intro.html?lang=en HTTP/1.1\n    Host: www.example.org\n    (a blank line ends the request; real browsers add more headers such as User-Agent and Accept.)\n    The path and query (/docs/intro.html?lang=en) go in the request line; the host (www.example.org) goes in the Host header; the scheme only chooses the protocol and port and is not sent as such. A #top fragment would never be sent: it is used only by the browser.\n(b) HTTP/1.1 404 Not Found - a 4xx code, so the client asked for something that is not there. If the server's program crashed it would send HTTP/1.1 500 Internal Server Error (a 5xx code: the server's fault).\n(c) In the lab www.example.org is only an alias: the DNS answer shows 'www.example.org. 300 IN CNAME example.org.' followed by the A record 'example.org. 300 IN A 198.51.100.20'. The request line and Host header are exactly as in (a) (plus User-Agent, Accept and Connection lines), and the response is HTTP/1.1 404 Not Found, as predicted."
    }
  ]
};
