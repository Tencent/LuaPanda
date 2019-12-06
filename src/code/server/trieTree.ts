
// Trie树节点，内部类
class treeNode{
    thisChr;    //当前节点指示的字符（为了方便观察）
	nextChr;	//字典，指向下一个孩子
	symbols;    //当前节点下挂的符号
	constructor(){
		this.nextChr = new Object();
		this.symbols = new Array();
    }
}

// Trie树的构造， 查询， 添加（不需要删除）
export class trieTree {
    // 构建树对外接口，一个文件构建一棵树
    // @symbolArray 传入单个文件的符号列表，array类型 
    // @return 返回构建字典树的根节点
    public static createSymbolTree(symbolArray){
        if(!Array.isArray(symbolArray) || symbolArray.length === 0){
            return;
        }
        let root : treeNode = new treeNode();
        root.thisChr = "TREE_ROOT";
        for (const symbol of symbolArray) {
            this.addNodeOnTrieTree( root , symbol);
        }
        return root;
    }

    // 内部方法，在树上增加节点
    // @root 树根
    // @symbol 单个符号名
    private static addNodeOnTrieTree(root , symbol){
        let currentPtr = root;
        let searchName= symbol.searchName;
        let searchArray = searchName.split('');
        for (let index = 0; index < searchArray.length; index++) {
            const it = searchArray[index];
            //遍历，没有则创建
            if(!currentPtr.nextChr[it] ){
               let newNode : treeNode = new treeNode();
               newNode.thisChr = it;
               currentPtr.nextChr[it] = newNode;
            }
            //移动指针
            currentPtr = currentPtr.nextChr[it];
            //当指向最后一个字母的时候，把节点挂上
            if(index === searchArray.length - 1){
                currentPtr.symbols.push(symbol);
            }
        }
    }

    // 在树上搜寻节点，这里的search方案是前缀搜索
    // @root 树根
    // @searchKey 要查找的key，类型是字符串
    // @return 搜索到的符号列表 
    public static searchOnTrieTree(root , searchKey){
        if(!root || !searchKey || searchKey == ''){
            return;
        }

        let currentPtr = root;
        let searchArray = searchKey.split('');

        for (let index = 0; index < searchArray.length; index++) {
            const it = searchArray[index];
            //遍历，树中没有此节点，说明皮配不上，返回
            if(!currentPtr.nextChr[it] ){
               return;
            }
            //移动指针到第一个匹配的节点
            currentPtr = currentPtr.nextChr[it];
            //当指向最后一个字母的时候，把节点挂上
            if(index === searchArray.length - 1){
                //继续向下遍历所有节点，把结果列出来
                let searchResult = this.travelAllNode(currentPtr);
                return searchResult;
            }
        }
    }

    // 递归遍历节点
    private static travelAllNode(node){
        let retArray;
        // 加上自身节点的数据
        if(node.symbols && node.symbols.length > 0){
            retArray = node.symbols;
        }
        // 去遍历子节点
        for (const key in node.nextChr) {
            const element = node.nextChr[key];
            let childArray = this.travelAllNode(element);
            if(retArray == undefined){
                retArray = childArray;
            }else{
                retArray = retArray.concat(childArray);   
            }
        }

        return retArray;
    }
}

