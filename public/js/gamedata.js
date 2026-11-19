// 게임 공용 데이터: 직업, 능력치, 모험 이벤트
(function () {
  const STATS = [
    { key: 'str', name: '힘', color: '#ff6b6b' },
    { key: 'agi', name: '민첩', color: '#4dd4ff' },
    { key: 'int', name: '지능', color: '#b48cff' },
    { key: 'luk', name: '행운', color: '#7be07b' },
    { key: 'vit', name: '체력', color: '#ffb84d' }
  ];
  const STAT_NAME = { str: '힘', agi: '민첩', int: '지능', luk: '행운', vit: '체력' };

  const CLASSES = {
    warrior: { name: '전사', img: 'assets/warrior.jpg', run: 'assets/sprites/run_warrior.png', color: '#ff6b6b',
      base: { str: 5, agi: 2, int: 1, luk: 2, vit: 4 }, desc: '튼튼한 몸과 강력한 한 방!',
      skills: { str: '대지 가르기', agi: '돌진 베기', int: '전술 지휘', luk: '기적의 방패', vit: '철벽 수호' } },
    mage: { name: '마법사', img: 'assets/mage.jpg', run: 'assets/sprites/run_mage.png', color: '#b48cff',
      base: { str: 1, agi: 2, int: 6, luk: 3, vit: 2 }, desc: '번뜩이는 지혜로 마법을 부려요.',
      skills: { str: '메테오', agi: '순간이동', int: '파이어볼', luk: '행운의 별빛', vit: '마나 실드' } },
    archer: { name: '궁수', img: 'assets/archer.jpg', run: 'assets/sprites/run_archer.png', color: '#7be07b',
      base: { str: 2, agi: 6, int: 2, luk: 2, vit: 2 }, desc: '바람처럼 빠르고 정확해요.',
      skills: { str: '관통 화살', agi: '질풍 화살', int: '매의 눈', luk: '럭키 샷', vit: '숲의 숨결' } },
    thief: { name: '도적', img: 'assets/thief.jpg', run: 'assets/sprites/run_thief.png', color: '#4dd4ff',
      base: { str: 2, agi: 4, int: 2, luk: 5, vit: 1 }, desc: '날쌘 몸놀림과 엄청난 운!',
      skills: { str: '급소 찌르기', agi: '그림자 질주', int: '함정 설치', luk: '대박 훔치기', vit: '연막탄' } },
    bard: { name: '음유시인', img: 'assets/bard.jpg', run: 'assets/sprites/run_bard.png', color: '#ffb84d',
      base: { str: 1, agi: 3, int: 3, luk: 4, vit: 3 }, desc: '노래 한 곡으로 분위기를 뒤집어요.',
      skills: { str: '록 스피릿', agi: '경쾌한 스텝', int: '혼란의 선율', luk: '앙코르!', vit: '응원가' } },
    cleric: { name: '성직자', img: 'assets/cleric.jpg', run: 'assets/sprites/run_cleric.png', color: '#ffe066',
      base: { str: 2, agi: 1, int: 4, luk: 2, vit: 5 }, desc: '빛의 힘으로 끝까지 버텨요.',
      skills: { str: '심판의 망치', agi: '빛의 날개', int: '성스러운 빛', luk: '축복', vit: '대회복' } }
  };

  const TRAITS = {
    brave: { name: '용맹한', icon: 'brave' },
    wise: { name: '지혜로운', icon: 'wise' },
    kind: { name: '다정한', icon: 'kind' },
    free: { name: '자유로운', icon: 'free' }
  };

  /* ============================================================
     이벤트
     - choice: 선택지. 선택지마다 gain(능력치), gold(골드), cost(필요 골드),
               check:{stat, dc} → 주사위(d20 + 능력치/3) 판정 후 ok / fail 결과
     - psych: 심리 질문 → 성향(trait) + 소량 능력치
     - riddle: 수수께끼 (RIDDLES에서 무작위)
     - levelup / timing / tap / chest / shop / gamble / fortune
     - make10 / chosung / uses / memory / slide : 두뇌·창의력 퍼즐
     ============================================================ */
  const C = (stat, dc, ok, fail) => ({ check: { stat, dc }, ok, fail });
  const EVENTS = {
    prologue: { type: 'psych', title: '모험 가방 챙기기', scene: 's_backpack',
      text: '교실 문이 무지개빛으로 빛나며 모험이 시작됐다! 주머니에는 골드 3개. 가방에 딱 하나만 더 넣을 수 있다면?',
      choices: [
        { label: '튼튼한 무기', trait: 'brave', gain: { str: 1 } },
        { label: '두꺼운 지도책', trait: 'wise', gain: { int: 1 } },
        { label: '친구에게 줄 간식', trait: 'kind', gain: { vit: 1 } },
        { label: '아무것도! 가볍게 간다', trait: 'free', gain: { agi: 1 } }
      ] },

    // ---------- 숲속 오솔길 (안전) ----------
    door: { type: 'choice', title: '빛나는 문', scene: 's_door',
      text: '나무 사이에 또 하나의 빛나는 문이 서 있다. 문 너머에서 "용사여… 들어오라…"는 목소리가 들린다.',
      choices: [
        { label: '망설임 없이 뛰어든다!', gain: { agi: 2, vit: 1 }, msg: '바람을 가르며 문으로 돌진했다!' },
        { label: '문을 꼼꼼히 살펴본다', gain: { int: 2 }, gold: 1, msg: '고대 문자를 해독하고, 문틈에서 동전도 주웠다!' },
        { label: '동전을 던져 앞면이면 들어간다', ...C('luk', 10, { gain: { luk: 3 }, msg: '앞면! 운명이 나를 부른다.' }, { gain: { luk: 1 }, msg: '뒷면… 그래도 그냥 들어갔다.' }) }
      ] },
    goblin: { type: 'choice', title: '고블린 문지기', scene: 's_goblin',
      text: '숲길을 막아선 고블린 문지기! "여기를 지나려면 나를 이기거나, 통행료를 내라, 키키킥!"',
      choices: [
        { label: '정면 승부! 힘으로 밀어붙인다', ...C('str', 11, { gain: { str: 3 }, gold: 2, msg: '고블린이 날아가며 금화를 떨어뜨렸다!' }, { gain: { str: 1, vit: -1 }, msg: '꽈당! 엉덩방아를 찧었지만 겨우 이겼다.' }) },
        { label: '눈 깜짝할 새 옆으로 빠져나간다', ...C('agi', 11, { gain: { agi: 3 }, msg: '고블린은 내가 지나간 줄도 모른다.' }, { gain: { agi: 1 }, gold: -1, msg: '들켜서 통행료 1골드를 뺏겼다!' }) },
        { label: '말로 설득해 본다', gain: { int: 2, luk: 1 }, msg: '고블린이 감동해서 길을 열어 줬다.' },
        { label: '통행료 2골드를 낸다', cost: 2, gain: { luk: 3, vit: 1 }, msg: '고블린이 고마워하며 행운의 부적을 줬다!' }
      ] },
    river: { type: 'choice', title: '거센 강물', scene: 's_river',
      text: '물살이 거센 강이 나타났다. 저 건너편에 반짝이는 무언가가 보인다.',
      choices: [
        { label: '헤엄쳐서 건넌다', ...C('vit', 10, { gain: { vit: 3 }, msg: '거친 물살을 이겨 냈다!' }, { gain: { vit: 1 }, msg: '물을 잔뜩 먹었지만 겨우 건넜다.' }) },
        { label: '돌다리를 폴짝폴짝 건넌다', ...C('agi', 12, { gain: { agi: 3 }, gold: 1, msg: '한 번도 안 빠지고, 반짝이던 금화까지 챙겼다!' }, { gain: { agi: 1, vit: -1 }, msg: '첨벙! 미끄러져 빠졌다…' }) },
        { label: '나무를 엮어 뗏목을 만든다', gain: { int: 2, str: 1 }, msg: '튼튼한 뗏목 완성!' },
        { label: '지나가던 거북이에게 부탁한다', gain: { luk: 2 }, trait: 'kind', msg: '거북이가 흔쾌히 태워 줬다.' }
      ] },
    dragon: { type: 'choice', title: '잠든 드래곤', scene: 's_dragon',
      text: '동굴 깊은 곳, 거대한 드래곤이 보물 위에서 코를 골며 자고 있다. 어떻게 할까?',
      choices: [
        { label: '깨워서 정정당당하게 싸운다', ...C('str', 14, { gain: { str: 4, vit: 1 }, gold: 3, msg: '드래곤이 내 용기에 감탄해 비늘과 금화를 줬다!' }, { gain: { str: 1, vit: 1 }, msg: '불길을 피해 도망쳤다. 그래도 근육은 남았다!' }) },
        { label: '발끝으로 살금살금 보물만 챙긴다', ...C('agi', 13, { gain: { agi: 2 }, gold: 5, msg: '들키지 않고 금화를 한 움큼 챙겼다!' }, { gain: { agi: 1, vit: -1 }, msg: '꼬리에 맞아 데굴데굴 굴렀다!' }) },
        { label: '드래곤의 꿈속 대화를 엿듣는다', gain: { int: 3 }, msg: '드래곤의 약점을 알아냈다.' },
        { label: '자장가를 불러 더 깊이 재운다', gain: { vit: 2, luk: 1 }, trait: 'kind', msg: '드래곤이 행복한 표정으로 잠꼬대를 한다.' }
      ] },
    fairy: { type: 'choice', title: '요정의 샘', scene: 's_fairy',
      text: '반짝이는 샘가에서 작은 요정이 손을 흔든다. "이 샘물에는 신기한 힘이 있단다!"',
      choices: [
        { label: '샘물을 벌컥벌컥 마신다', ...C('luk', 9, { gain: { vit: 2, luk: 2 }, msg: '몸이 가벼워지고 행운이 깃들었다!' }, { gain: { vit: 1 }, msg: '그냥… 맛있는 물이었다.' }) },
        { label: '동전 1개를 던지며 소원을 빈다', cost: 1, gain: { luk: 3, int: 1 }, msg: '샘이 반짝! 소원이 이루어질 것 같다.' },
        { label: '샘물을 병에 담아 판다', gold: 3, msg: '시장에서 비싸게 팔릴 것 같다. +3골드!' },
        { label: '요정과 수다를 떤다', gain: { int: 1, luk: 1 }, trait: 'kind', msg: '요정이 숲의 비밀을 알려 줬다.' }
      ] },
    mushroom: { type: 'choice', title: '빛나는 버섯 숲', scene: 's_mushroom',
      text: '형형색색으로 빛나는 거대한 버섯들. 어떤 건 맛있어 보이고, 어떤 건… 수상하다.',
      choices: [
        { label: '제일 빛나는 버섯을 먹는다', ...C('luk', 11, { gain: { str: 2, agi: 2 }, msg: '온몸에 힘이 솟는다!!' }, { gain: { vit: -1, luk: 2 }, msg: '배탈이 났다… 대신 깨달음(?)을 얻었다.' }) },
        { label: '조심히 채집해서 판다', gold: 3, msg: '희귀 버섯이다! +3골드' },
        { label: '버섯 도감을 그린다', gain: { int: 2 }, trait: 'wise', msg: '멋진 버섯 도감이 완성됐다.' },
        { label: '숨을 참고 빠르게 지나간다', gain: { vit: 2 }, msg: '폐활량이 늘었다!' }
      ] },
    swamp: { type: 'psych', title: '친구의 위기', scene: 's_swamp',
      text: '함께 걷던 동료가 늪에 빠졌다! 그 순간 나는?',
      choices: [
        { label: '바로 늪으로 뛰어든다', trait: 'brave', gain: { vit: 1 } },
        { label: '주변에서 긴 나뭇가지를 찾는다', trait: 'wise', gain: { int: 1 } },
        { label: '"괜찮아!" 하고 손을 꼭 잡는다', trait: 'kind', gain: { vit: 1 } },
        { label: '밧줄을 휙 던져 구한다', trait: 'free', gain: { agi: 1 } }
      ] },
    campfire: { type: 'psych', title: '모닥불 앞에서', scene: 's_campfire',
      text: '밤이 되어 동료들과 모닥불 앞에 모였다. 나는 주로…',
      choices: [
        { label: '내일 싸울 몬스터 이야기를 한다', trait: 'brave', gain: { str: 1 } },
        { label: '별자리를 보며 길을 계산한다', trait: 'wise', gain: { int: 1 } },
        { label: '다친 동료를 챙긴다', trait: 'kind', gain: { vit: 1 } },
        { label: '노래를 부르며 분위기를 띄운다', trait: 'free', gain: { luk: 1 } }
      ] },
    treasure: { type: 'psych', title: '보물 상자 발견', scene: 's_treasure',
      text: '길가에서 보물 상자를 발견했다! 열어 보니 금화가 가득하다. 나는…',
      choices: [
        { label: '더 큰 보물을 찾아 계속 전진!', trait: 'brave', gain: { str: 1 }, gold: 1 },
        { label: '필요한 만큼만 챙기고 기록해 둔다', trait: 'wise', gain: { int: 1 }, gold: 2 },
        { label: '동료들과 똑같이 나눈다', trait: 'kind', gain: { vit: 1 }, gold: 1 },
        { label: '금화로 멋진 모자를 산다', trait: 'free', gain: { luk: 2 } }
      ] },

    // ---------- 험난한 지름길 (위험) ----------
    boulder: { type: 'timing', title: '바위 깨기', scene: 's_boulder', stat: 'str',
      text: '거대한 바위가 길을 막고 있다! 바늘이 초록 구역에 들어올 때 [내려치기]를 눌러라. 구역은 매번 바뀐다. 기회는 3번!' },
    slime: { type: 'tap', title: '도망치는 황금 슬라임', scene: 's_slime', stat: 'agi',
      text: '황금 슬라임이 나타났다! 5초 동안 이리저리 도망치는 슬라임을 최대한 많이 터치해서 붙잡아라!' },
    spikes: { type: 'choice', title: '함정 복도', scene: 's_trap',
      text: '발밑에는 가시 구덩이, 벽에서는 화살이 슝슝! 이 복도를 어떻게 지나갈까?',
      choices: [
        { label: '도움닫기로 점프!', ...C('agi', 12, { gain: { agi: 3 }, gold: 2, msg: '공중에서 화살까지 피했다! 바닥의 금화도 챙김!' }, { gain: { agi: 1, vit: -2 }, msg: '으악! 가시에 찔렸다…' }) },
        { label: '방패를 들고 정면 돌파', ...C('vit', 11, { gain: { vit: 3, str: 1 }, msg: '화살이 튕겨 나간다! 철벽 그 자체.' }, { gain: { str: 1, vit: -1 }, msg: '화살 몇 대를 맞았지만 버텼다.' }) },
        { label: '함정 장치를 해체한다', ...C('int', 13, { gain: { int: 3 }, gold: 3, msg: '딸깍! 해체 성공. 부품을 팔면 돈이 되겠다.' }, { gain: { int: 1, vit: -1 }, msg: '선을 잘못 끊었다! 화살이 날아왔다.' }) }
      ] },
    bridge: { type: 'choice', title: '흔들다리', scene: 's_bridge',
      text: '안개 낀 낭떠러지 위로 낡은 흔들다리가 삐걱거린다. 판자 몇 개는 이미 빠져 있다.',
      choices: [
        { label: '전속력으로 달려서 건넌다', ...C('agi', 11, { gain: { agi: 3 }, msg: '판자가 떨어지기 전에 건넜다!' }, { gain: { agi: 1, vit: -1 }, msg: '발이 빠져서 대롱대롱… 겨우 올라왔다.' }) },
        { label: '밧줄을 꽉 잡고 천천히', ...C('vit', 9, { gain: { vit: 2, luk: 1 }, msg: '침착하게 한 발 한 발 건넜다.' }, { gain: { vit: 1 }, msg: '팔이 후들후들… 그래도 건넜다.' }) },
        { label: '다리를 고치면서 건넌다', ...C('int', 12, { gain: { int: 2, str: 1 }, gold: 1, msg: '다리 수리 완료! 다음 여행자가 팁을 줬다.' }, { gain: { int: 1 }, msg: '고치다 말았지만 어쨌든 건넜다.' }) },
        { label: '다리 대신 절벽을 기어오른다', ...C('str', 14, { gain: { str: 4 }, msg: '맨손으로 절벽 정복! 전설이 될 것이다.' }, { gain: { str: 1, vit: -1 }, msg: '중간에 미끄러졌다. 아야야…' }) }
      ] },
    wolves: { type: 'choice', title: '달밤의 늑대 무리', scene: 's_wolves',
      text: '어두운 숲에서 늑대 세 마리가 눈을 번뜩이며 다가온다. 으르렁…!',
      choices: [
        { label: '정면으로 맞서 싸운다', ...C('str', 12, { gain: { str: 3, vit: 1 }, msg: '늑대들이 꼬리를 내리고 도망쳤다!' }, { gain: { str: 1, vit: -2 }, msg: '물려서 다쳤다… 겨우 쫓아냈다.' }) },
        { label: '재빨리 나무 위로 올라간다', ...C('agi', 11, { gain: { agi: 3 }, msg: '늑대들이 포기하고 돌아갔다.' }, { gain: { agi: 1 }, gold: -1, msg: '올라가다 주머니에서 골드가 떨어졌다!' }) },
        { label: '불을 피워 쫓아낸다', ...C('int', 11, { gain: { int: 3 }, msg: '불꽃에 놀란 늑대들이 달아났다.' }, { gain: { int: 1, vit: -1 }, msg: '불이 잘 안 붙는다… 결국 몸으로 막았다.' }) },
        { label: '육포를 던져 준다', cost: 2, gain: { luk: 2, vit: 1 }, trait: 'kind', msg: '늑대들이 꼬리를 흔들며 길을 안내해 줬다!' }
      ] },
    fog: { type: 'choice', title: '독안개 늪', scene: 's_swamp',
      text: '보랏빛 독안개가 피어오르는 늪. 숨을 쉴 때마다 목이 따끔하다.',
      choices: [
        { label: '숨을 참고 단숨에 돌파', ...C('vit', 12, { gain: { vit: 3 }, msg: '폐활량 만렙! 무사히 통과했다.' }, { gain: { vit: -1, luk: 1 }, msg: '콜록콜록… 어지럽지만 빠져나왔다.' }) },
        { label: '약초로 해독제를 만든다', ...C('int', 11, { gain: { int: 2, vit: 1 }, msg: '해독제 완성! 안개 따위 문제없다.' }, { gain: { int: 1 }, msg: '맛이 너무 쓰다… 효과는 반쯤.' }) },
        { label: '멀리 돌아서 간다', gain: { agi: 1, vit: 1 }, msg: '오래 걸렸지만 안전하게 도착했다.' }
      ] },
    golem: { type: 'choice', title: '골렘 문지기', scene: 's_statue',
      text: '고대 유적 입구의 돌 골렘이 눈을 번쩍 떴다. "침입자… 시험을… 받아라…"',
      choices: [
        { label: '주먹 대 주먹으로 맞붙는다', ...C('str', 14, { gain: { str: 4 }, gold: 2, msg: '쿵! 골렘이 무릎을 꿇었다!' }, { gain: { str: 1, vit: -1 }, msg: '주먹이 얼얼하다… 골렘이 동정심에 길을 비켜 줬다.' }) },
        { label: '등 뒤의 룬 문자를 노린다', ...C('agi', 12, { gain: { agi: 2, int: 1 }, msg: '룬을 건드리자 골렘이 멈췄다.' }, { gain: { agi: 1 }, msg: '들켰다! 한참 쫓기다 겨우 따돌렸다.' }) },
        { label: '고대어로 명령한다', ...C('int', 13, { gain: { int: 4 }, msg: '"…주인님?" 골렘이 고개를 숙였다.' }, { gain: { int: 1, luk: 1 }, msg: '발음이 틀렸지만 골렘이 웃다가 길을 비켜 줬다.' }) }
      ] },

    // ---------- 고대 유적 (두뇌) ----------
    riddle: { type: 'riddle', title: '수수께끼의 석판', scene: 's_stonedoor', repeat: true },
    make10: { type: 'make10', title: '숫자 자물쇠', scene: 's_vault',
      text: '보물 창고 자물쇠에 숫자 4개가 새겨져 있다. 네 숫자를 한 번씩 모두 쓰고 + − × ÷ ( ) 로 계산해 10을 만들면 열린다!' },
    chosung: { type: 'chosung', title: '고대 문자 해독', scene: 's_stonedoor',
      text: '벽에 고대 문자(초성)가 새겨져 있다. 주제에 맞는 낱말을 떠올려 입력하라! 75초 안에 많이 풀수록 좋다.' },
    uses: { type: 'uses', title: '발명가의 작업실', scene: 's_workshop',
      text: '괴짜 발명가가 물건 하나를 내민다. "이걸로 할 수 있는 일을 최대한 많이 생각해 봐! 엉뚱할수록 좋아!"' },
    memory: { type: 'memory', title: '기억의 신전', scene: 's_shrine',
      text: '제단 위에 마법 카드 16장이 뒤집혀 있다. 같은 그림 두 장을 찾아 모두 짝을 맞춰라. 적게 뒤집을수록 좋다!' },
    slide: { type: 'slide', title: '조각난 벽화', scene: 's_castle',
      text: '마왕성으로 가는 길이 그려진 벽화가 조각나 있다. 조각을 밀어서 원래 그림으로 맞춰라!' },

    // ---------- 떠돌이 시장 ----------
    shop: { type: 'shop', title: '수상한 마법 상인', scene: 's_merchant', repeat: true,
      text: '"어서 오게, 젊은 용사! 골드만 있으면 뭐든 팔지." 상인이 신비한 물건들을 펼쳐 보인다.' },
    gamble: { type: 'gamble', title: '도박꾼 고블린', scene: 's_dicegoblin', repeat: true,
      text: '"키킥, 주사위 한 판 어때? 네 눈이 더 크면 건 돈의 두 배를 주지!" (최대 3판)' },
    chest: { type: 'chest', title: '세 개의 상자', scene: 's_treasure',
      text: '상자 세 개가 놓여 있다. 하나는 금화, 하나는 행운… 그리고 하나는 미믹(상자 괴물)이라는 소문이!' },
    fortune: { type: 'fortune', title: '점술사의 천막', scene: 's_fortune',
      text: '"운명의 카드를 한 장 뽑아 보렴. 복채는 1골드란다." 수정 구슬이 신비롭게 빛난다.' },

    // ---------- 고정 ----------
    lv1: { type: 'levelup', title: '레벨 업!', scene: 's_levelup', points: 3,
      text: '첫 번째 시련을 이겨 냈다! 몸에서 힘이 솟는다. 능력치 포인트 3개를 원하는 곳에 찍자.' },
    lv2: { type: 'levelup', title: '마지막 레벨 업!', scene: 's_levelup', points: 4,
      text: '최종 결전이 다가온다. 온몸에 전설의 힘이 깃든다! 포인트 4개를 찍자.' },
    boss: { type: 'choice', title: '마왕의 성', scene: 's_castle', boss: true,
      text: '마왕이 왕좌에서 일어섰다. "여기까지 오다니… 덤벼라!" 가장 자신 있는 능력으로 마지막 일격을 날리자! (주사위 판정)',
      choices: [
        { label: '모든 힘을 담은 필살기!', ...C('str', 13, { gain: { str: 4, vit: 1 }, msg: '번쩍! 마왕의 왕관이 날아갔다!' }, { gain: { str: 2 }, msg: '빗나갔지만 성벽이 무너졌다!' }) },
        { label: '빛보다 빠른 연속 공격!', ...C('agi', 13, { gain: { agi: 4, luk: 1 }, msg: '마왕이 어지러워 비틀거린다!' }, { gain: { agi: 2 }, msg: '몇 대는 막혔지만 마왕이 지쳐 간다!' }) },
        { label: '약점을 정확히 노린 마법!', ...C('int', 13, { gain: { int: 4, luk: 1 }, msg: '마왕의 방어막이 산산조각 났다!' }, { gain: { int: 2 }, msg: '방어막에 금이 갔다!' }) },
        { label: '끝까지 버티며 반격한다', ...C('vit', 13, { gain: { vit: 4, str: 1 }, msg: '마왕의 공격을 다 받아 내고 역습 성공!' }, { gain: { vit: 2 }, msg: '너덜너덜하지만 쓰러지지 않았다!' }) },
        { label: '마왕에게 친구가 되자고 손 내밀기', trait: 'kind', ...C('luk', 15, { gain: { luk: 4, vit: 2 }, msg: '마왕이 눈물을 글썽이며 손을 잡았다…?!' }, { gain: { luk: 1, vit: 1 }, msg: '"흥!" 마왕이 부끄러워하며 도망쳤다.' }) }
      ] },
    epilogue: { type: 'psych', title: '모험의 끝', scene: 's_sunset', epilogue: true,
      text: '모험을 마치고 교실 문 앞에 섰다. 남은 골드는 행운의 부적으로 바뀐다. 문을 열기 전, 마지막으로 떠오른 생각은?',
      choices: [
        { label: '"다음엔 더 강한 적과 싸우고 싶어!"', trait: 'brave', gain: { str: 1 } },
        { label: '"오늘 배운 것을 잊지 말아야지."', trait: 'wise', gain: { int: 1 } },
        { label: '"함께해 준 친구들 고마워."', trait: 'kind', gain: { vit: 1 } },
        { label: '"재밌었다! 또 떠나야지~"', trait: 'free', gain: { agi: 1 } }
      ] }
  };

  // 갈림길에서 고르는 길
  const PATHS = {
    safe: { name: '숲속 오솔길', icon: 'map', risk: 1, desc: '평화로운 길. 이야기와 마음의 질문', pool: ['door', 'goblin', 'river', 'dragon', 'fairy', 'mushroom', 'swamp', 'campfire', 'treasure'] },
    risk: { name: '험난한 지름길', icon: 'spike', risk: 3, desc: '함정과 괴물! 위험하지만 보상이 크다', pool: ['boulder', 'slime', 'spikes', 'bridge', 'wolves', 'fog', 'golem'] },
    brain: { name: '고대 유적', icon: 'puzzle', risk: 2, desc: '수수께끼와 두뇌·창의력 퍼즐', pool: ['make10', 'chosung', 'uses', 'memory', 'slide', 'riddle'] },
    market: { name: '떠돌이 시장', icon: 'coin', risk: 2, desc: '상점·도박·점술. 골드를 불려 볼까?', pool: ['shop', 'gamble', 'chest', 'fortune'] }
  };
  const CHAPTERS = [
    { name: '1장 · 속삭이는 숲', scene: 's_crossroads', text: '숲 한가운데 갈림길. 표지판이 세 방향을 가리킨다. 어느 길로 갈까?' },
    { name: '2장 · 안개 낀 협곡', scene: 's_bridge', text: '협곡 앞에서 길이 또 갈라졌다. 안개 너머로 서로 다른 소리가 들려온다.' },
    { name: '3장 · 마왕성 앞 폐허', scene: 's_wolves', text: '마왕성이 멀리 보인다. 마지막 갈림길! 여기서 고른 길이 결전 전 마지막 준비다.' }
  ];
  // 모험 순서. X0~X2는 갈림길(고른 길에 따라 이벤트 3개가 뒤에 추가됨)
  const FLOW = ['prologue', 'X0', 'lv1', 'X1', 'X2', 'lv2', 'boss', 'epilogue'];
  const EVENTS_PER_PATH = 3;
  const TOTAL_STEPS = FLOW.length + EVENTS_PER_PATH * 3; // 17

  const RIDDLES = [
    { q: '거대한 석판에 글씨가 떠오른다. "깨뜨려야 비로소 쓸 수 있는 것은 무엇이냐?"', options: ['유리컵', '달걀', '거울', '접시'], answer: 1, why: '달걀은 깨야 요리할 수 있죠!' },
    { q: '"세상에서 가장 빠른 닭은?"', options: ['꼬끼오', '후다닥', '번개닭', '치킨'], answer: 1, why: '후다닥~!' },
    { q: '"1, 1, 2, 3, 5, 8, ?" 다음 숫자는?', options: ['11', '12', '13', '16'], answer: 2, why: '앞의 두 수를 더하면 다음 수! 5+8=13' },
    { q: '"2, 6, 12, 20, 30, ?" 다음 숫자는?', options: ['36', '40', '42', '48'], answer: 2, why: '1×2, 2×3, 3×4… 다음은 6×7=42' },
    { q: '상자 3개에 [사과], [귤], [섞임] 라벨이 붙어 있는데 라벨이 모두 틀렸다. 딱 한 상자에서 과일 하나만 꺼내 보고 모두 맞히려면 어느 상자를 열어야 할까?', options: ['[사과] 상자', '[귤] 상자', '[섞임] 상자', '알 수 없다'], answer: 2, why: '[섞임] 상자는 한 종류만 들어 있으니, 하나만 꺼내 봐도 나머지가 정해져요.' },
    { q: '형제가 6명 있다. 형제마다 여동생이 딱 1명씩 있다. 이 집 아이는 모두 몇 명일까?', options: ['6명', '7명', '12명', '13명'], answer: 1, why: '여동생은 모두 같은 한 명! 6+1=7명' },
    { q: '깊이 10m 우물에 빠진 달팽이. 낮에 3m 올라가고 밤에 2m 미끄러진다. 며칠째에 탈출할까?', options: ['7일째', '8일째', '9일째', '10일째'], answer: 1, why: '7일 동안 7m, 8일째 낮에 3m를 올라가 탈출!' },
    { q: '"다리는 넷인데 한 걸음도 못 걷는 것은?"', options: ['거북이', '의자', '개미', '강아지'], answer: 1, why: '의자 다리는 4개지만 걷지 못하죠.' },
    { q: '"자동차를 톡 치면?"', options: ['카톡', '빵빵', '쾅', '부릉'], answer: 0, why: '카(car)+톡 = 카톡!' },
    { q: 'A: "B는 거짓말쟁이야." B: "우리 둘 다 정직해." 둘 중 딱 한 명만 정직하다면, 정직한 사람은?', options: ['A', 'B', '둘 다', '알 수 없다'], answer: 0, why: 'B 말이 사실이면 둘 다 정직해야 해서 모순! 그러니 A가 정직해요.' },
    { q: '3시 정각, 시침과 분침이 이루는 작은 쪽 각도는?', options: ['60도', '90도', '120도', '180도'], answer: 1, why: '한 시간에 30도씩, 3칸이면 90도!' },
    { q: '"왕이 넘어지면?"', options: ['킹콩', '왕창', '쿵왕', '왕눈이'], answer: 0, why: '킹(왕)이 콩!' },
    { q: '빨간 공 3개와 파란 공 3개가 든 주머니. 눈을 감고 꺼낼 때, 같은 색 2개가 반드시 나오려면 최소 몇 개를 꺼내야 할까?', options: ['2개', '3개', '4개', '6개'], answer: 1, why: '색이 2가지뿐이라 3개를 꺼내면 반드시 같은 색이 2개!' },
    { q: '거꾸로 읽어도 똑같은 낱말은?', options: ['토마토', '바나나', '오렌지', '사과'], answer: 0, why: '토-마-토, 거꾸로 해도 토-마-토!' }
  ];

  const CHOSUNG_CATS = {
    '동물': '고양이 강아지 호랑이 사자 기린 코끼리 원숭이 토끼 거북이 고래 돌고래 상어 펭귄 여우 늑대 다람쥐 판다 하마 악어 독수리 부엉이 참새 비둘기 오리 낙타 얼룩말 캥거루 고릴라 코알라 염소 돼지 사슴 수달 너구리 두더지 개구리 나비 잠자리 문어 오징어 다람쥐 고라니 기러기 까치 까마귀 박쥐 하이에나 치타 표범 젖소 닭 말 소 양 곰 뱀 쥐 게 새우 해파리 거미 개미 벌 모기 매미 사마귀 메뚜기 고슴도치 햄스터 앵무새 공작 백조 두루미 황소 물개 바다표범 북극곰 미어캣',
    '음식': '사과 바나나 포도 수박 딸기 복숭아 귤 참외 자두 망고 김밥 떡볶이 라면 피자 치킨 햄버거 비빔밥 불고기 김치 만두 짜장면 짬뽕 떡국 순대 호떡 붕어빵 아이스크림 초콜릿 사탕 과자 우유 케이크 도넛 샌드위치 토마토 감자 고구마 당근 오이 옥수수 김치찌개 된장찌개 계란말이 돈가스 카레 스파게티 우동 냉면 삼겹살 갈비 잡채 송편 떡 빵 국수 주먹밥 핫도그 감자튀김 팝콘 요거트 치즈 버터 꿀 식빵 젤리 시리얼 배 감 밤 레몬 키위 체리 파인애플 멜론 블루베리 오렌지 양파 마늘 고추 버섯 호박 시금치 배추 무',
    '학교': '연필 지우개 공책 필통 가방 칠판 분필 책상 의자 교실 선생님 친구 운동장 급식 체육복 실내화 사물함 시간표 숙제 시험 방학 졸업 입학 도서관 과학실 음악실 컴퓨터 가위 풀 색연필 크레파스 물감 붓 줄넘기 축구공 농구공 리코더 알림장 교과서 수학 국어 과학 사회 영어 체육 미술 음악 반장 짝꿍 복도 계단 교문 강당 보건실 교무실 화장실 쉬는시간 점심시간 시계 달력 자 각도기 컴퍼스 스케치북 공 배구공 피구 독서 일기 받아쓰기 발표 학급회의',
    '나라·도시': '한국 일본 중국 미국 영국 프랑스 독일 캐나다 호주 브라질 인도 러시아 이탈리아 스페인 멕시코 이집트 태국 베트남 필리핀 몽골 터키 그리스 스위스 네덜란드 칠레 페루 케냐 서울 부산 대구 인천 광주 대전 울산 제주 수원 춘천 강릉 전주 경주 포항 파리 런던 뉴욕 도쿄 베이징 로마 시드니 방콕 하노이',
    '직업': '의사 간호사 경찰 소방관 요리사 가수 배우 화가 작가 기자 군인 농부 어부 목수 미용사 약사 변호사 판사 과학자 우주인 비행사 기관사 운전사 선생님 교수 디자이너 프로그래머 유튜버 축구선수 야구선수 수의사 사육사 제빵사 바리스타 건축가 사진작가 아나운서 마술사 탐정 발명가 정원사 집배원 택배기사 은행원 회사원 판사 검사 성우 댄서 피아니스트 지휘자 조종사 승무원 선장 해녀 광부'
  };
  const USES_OBJECTS = ['벽돌', '빈 페트병', '종이 클립', '신문지', '양말 한 짝', '고무줄', '숟가락', '고장 난 우산', '빨대', '종이컵', '빈 상자', '옷걸이'];

  const SHOP_ITEMS = [
    { id: 'p_str', name: '거인의 물약', icon: 'str', cost: 3, gain: { str: 2 } },
    { id: 'p_agi', name: '바람의 신발', icon: 'agi', cost: 3, gain: { agi: 2 } },
    { id: 'p_int', name: '현자의 안경', icon: 'int', cost: 3, gain: { int: 2 } },
    { id: 'p_luk', name: '네잎클로버', icon: 'luk', cost: 3, gain: { luk: 2 } },
    { id: 'p_vit', name: '생명의 물약', icon: 'vit', cost: 3, gain: { vit: 2 } },
    { id: 'p_rand', name: '수상한 물약', icon: 'potion', cost: 2, random: true },
    { id: 'p_all', name: '만능 비약', icon: 'star', cost: 7, gain: { str: 1, agi: 1, int: 1, luk: 1, vit: 1 } }
  ];

  function dominantTrait(traits) {
    let best = null, bestV = -1;
    Object.keys(TRAITS).forEach(k => {
      const v = (traits && traits[k]) || 0;
      if (v > bestV) { best = k; bestV = v; }
    });
    return bestV > 0 ? best : null;
  }
  function titleOf(cls, traits) {
    const c = CLASSES[cls];
    const t = dominantTrait(traits);
    if (!c) return '견습 모험가';
    return (t ? TRAITS[t].name + ' ' : '') + c.name;
  }
  function topStat(stats) {
    let best = 'str', v = -1;
    STATS.forEach(s => { if ((stats[s.key] || 0) > v) { v = stats[s.key] || 0; best = s.key; } });
    return best;
  }
  function totalPower(stats) { return STATS.reduce((a, s) => a + (stats[s.key] || 0), 0); }

  window.GameData = {
    STATS, STAT_NAME, CLASSES, TRAITS, EVENTS, PATHS, CHAPTERS, FLOW, EVENTS_PER_PATH, TOTAL_STEPS,
    RIDDLES, CHOSUNG_CATS, USES_OBJECTS, SHOP_ITEMS,
    dominantTrait, titleOf, topStat, totalPower
  };
})();
