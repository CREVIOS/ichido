-- Most ATMs in Japan stand in convenience stores. The demo ATM station becomes one: "where to ask" is the ATM
-- operator's help line through the phone on the ATM (24 hours), not a bank branch counter, and the Help Point is
-- run by the ATM operator. Replies from manual retained-card/v3 read "you can also ask {branch} ({hours})".
-- Only the untouched demo row changes; a station an operator has already edited keeps its own values.
update public.station set
  label = '{"ja": "出島マート 長崎駅前店 ATM", "bn": "দেজিমা মার্ট (নাগাসাকি স্টেশনের সামনে) এটিএম", "en": "Dejima Mart Nagasaki Station store ATM", "vi": "Cây ATM tại cửa hàng Dejima Mart trước ga Nagasaki", "id": "ATM di Dejima Mart depan Stasiun Nagasaki", "ne": "देजिमा मार्ट (नागासाकी स्टेसन अगाडि) को एटीएम"}',
  branch = '{"ja": "ATMの 電話で 出島ATMサービス", "bn": "এটিএমের ফোনে দেজিমা এটিএম সার্ভিস", "en": "Dejima ATM Service on the ATM''s phone", "vi": "Dejima ATM Service qua điện thoại trên máy ATM", "id": "Dejima ATM Service lewat telepon di mesin ATM", "ne": "एटीएमको फोनबाट देजिमा एटीएम सर्भिस"}',
  counter_hours = '{"ja": "24時間", "bn": "২৪ ঘণ্টা", "en": "24 hours", "vi": "24 giờ", "id": "24 jam", "ne": "२४ घण्टा"}',
  host_org = '出島ATMサービス',
  short_address = '出島マート 長崎駅前店 店内'
where id = 'TABLE-A' and label->>'ja' = '長崎駅前 店舗外ATM';
